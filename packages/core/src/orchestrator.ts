import { readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import type { AgentId, LockfileV1, LockedSkillV1, ProjectManifestV1 } from '../../schema/src/index.ts';
import { normalizeProjectManifest, stableStringify, validateLockfile } from '../../schema/src/index.ts';
import { AunoError, pathExists, readJsonFile, sha256Bytes, writeTextAtomic } from '../../shared/src/index.ts';
import { scanProject } from '../../detector/src/index.ts';
import { explainRecommendation, recommendSkills, type Recommendation, type RecommendationExplanation, type SkillCandidateMetadata } from '../../recommender/src/index.ts';
import type { RegistryClient, RegistryIndex } from '../../registry/src/index.ts';
import { decodeSkillBundle } from '../../registry/src/index.ts';
import { ContentAddressedStore } from '../../store/src/index.ts';
import { resolveManifest } from '../../resolver/src/index.ts';
import { evaluatePolicy, verifyIntegrity } from '../../security/src/index.ts';
import { planSkillMaterializations, renderPlanIntegrity, type CanonicalSkill, type MaterializationPlan } from '../../adapters/src/index.ts';
import { applyMaterializationPlans } from './materialize.ts';
import { withProjectWriteLock } from './locks.ts';
import { inspectMaterializations, type DoctorReport } from './doctor.ts';
import { auditLockfile, meetsAuditThreshold, type AuditReport, type AuditSeverity, type RegistrySignerStates } from './audit.ts';
import { readOwnership, writeOwnership } from './state.ts';
import { rollbackLatestCommittedTransaction } from './transactions.ts';

export interface CoreOptions { projectRoot: string; registries: Record<string, RegistryClient>; cacheRoot?: string; version?: string }
export interface InstallOptions { frozenLockfile?: boolean; offline?: boolean; approveCapabilities?: boolean; dryRun?: boolean }
export interface InstallResult { lock: LockfileV1; lockText: string; plans: MaterializationPlan[] }

function portableMaterializationTarget(projectRoot: string, target: string): string {
  const projectRelative = relative(projectRoot, target).replaceAll('\\', '/');
  if (projectRelative !== '..' && !projectRelative.startsWith('../')) return projectRelative || '.';
  const homeRelative = relative(homedir(), target).replaceAll('\\', '/');
  if (homeRelative !== '..' && !homeRelative.startsWith('../')) return `~/${homeRelative}`;
  throw new AunoError({ code: 'AUNO_NONPORTABLE_TARGET', message: `Materialization target is outside portable roots: ${target}`, category: 'materialization' });
}

function registryLocalId(skillId: string): string {
  const colon = skillId.indexOf(':');
  return colon === -1 ? skillId : skillId.slice(colon + 1);
}

export class AunoSkillsCore {
  readonly projectRoot: string;
  readonly registries: Record<string, RegistryClient>;
  readonly store: ContentAddressedStore;
  readonly version: string;

  constructor(options: CoreOptions) {
    this.projectRoot = options.projectRoot;
    this.registries = options.registries;
    this.store = new ContentAddressedStore(options.cacheRoot ?? join(homedir(), '.aunoskills', 'cache'));
    this.version = options.version ?? '0.1.0';
  }

  async #manifest(): Promise<ProjectManifestV1> { return normalizeProjectManifest(await readJsonFile(join(this.projectRoot, 'aunoskills.json'))); }
  #manifestDigest(manifest: ProjectManifestV1): string { return `sha256:${sha256Bytes(Buffer.from(stableStringify(manifest)))}`; }
  async #lock(): Promise<LockfileV1 | undefined> {
    const path = join(this.projectRoot, 'skills-lock.json');
    if (!await pathExists(path)) return undefined;
    return validateLockfile(await readJsonFile(path));
  }
  async #registrySnapshots(): Promise<Record<string, RegistryIndex>> {
    const snapshots: Record<string, RegistryIndex> = {};
    for (const [name, client] of Object.entries(this.registries)) snapshots[name] = await client.loadIndex();
    return snapshots;
  }
  async detect() { return scanProject(this.projectRoot); }
  async #candidates(): Promise<SkillCandidateMetadata[]> {
    const candidates: SkillCandidateMetadata[] = [];
    for (const [registryName, index] of Object.entries(await this.#registrySnapshots())) {
      for (const [id, skill] of Object.entries(index.skills)) {
        const version = skill.versions[skill.latest] ?? Object.values(skill.versions)[0];
        if (!version) continue;
        candidates.push({ id: `${registryName}:${id}`, trust: version.trust, recommendation: version.metadata?.recommendation, topics: version.metadata?.topics, quality: 0.8, freshness: 0.8 });
      }
    }
    return candidates;
  }
  async recommend(): Promise<Recommendation[]> { return recommendSkills(await this.detect(), await this.#candidates()); }
  async explain(skillId: string): Promise<RecommendationExplanation> {
    const candidate = (await this.#candidates()).find((item) => item.id === skillId);
    if (!candidate) throw new AunoError({ code: 'AUNO_SKILL_NOT_FOUND', message: `AUNO_SKILL_NOT_FOUND ${skillId}`, category: 'resolution' });
    return explainRecommendation(await this.detect(), candidate);
  }

  async #bundleFor(skillId: string, locked: LockedSkillV1, offline: boolean): Promise<CanonicalSkill> {
    if (!await this.store.has(locked.bundleIntegrity)) {
      if (offline) throw new AunoError({ code: 'AUNO_OFFLINE_BLOB_MISSING', message: `AUNO_OFFLINE_BLOB_MISSING ${locked.bundleIntegrity}`, category: 'cache' });
      const registry = this.registries[locked.registry];
      if (!registry) throw new AunoError({ code: 'AUNO_REGISTRY_NOT_FOUND', message: `AUNO_REGISTRY_NOT_FOUND ${locked.registry}`, category: 'registry' });
      const bytes = await registry.fetchBundle(locked.bundleIntegrity);
      verifyIntegrity(bytes, locked.bundleIntegrity);
      await this.store.put(bytes, locked.bundleIntegrity);
    }
    const bytes = await this.store.get(locked.bundleIntegrity);
    verifyIntegrity(bytes, locked.bundleIntegrity);
    return decodeSkillBundle(bytes);
  }

  async #plan(manifest: ProjectManifestV1, lock: LockfileV1, options: InstallOptions): Promise<MaterializationPlan[]> {
    const plans: MaterializationPlan[] = [];
    for (const [skillId, locked] of Object.entries(lock.skills)) {
      const decision = evaluatePolicy(manifest.policy ?? {}, { trust: locked.effectiveTrust, capabilities: locked.capabilities });
      if (!decision.allowed) throw new AunoError({ code: 'AUNO_SECURITY_POLICY', message: `AUNO_SECURITY_POLICY ${skillId}: ${decision.reasons.join('; ')}`, category: 'security' });
      const escalation = locked.resolution?.permissionEscalation;
      if (Array.isArray(escalation) && escalation.length && !options.approveCapabilities) throw new AunoError({ code: 'AUNO_CAPABILITY_ESCALATION', message: `AUNO_CAPABILITY_ESCALATION ${skillId}: ${escalation.join(', ')}`, category: 'security' });
      if (decision.requiresApproval && !options.approveCapabilities) throw new AunoError({ code: 'AUNO_CAPABILITY_APPROVAL_REQUIRED', message: `AUNO_CAPABILITY_APPROVAL_REQUIRED ${skillId}`, category: 'security' });
      const canonical = await this.#bundleFor(skillId, locked, options.offline ?? false);
      const intent = manifest.skills[skillId];
      const agents = (intent?.agents?.length ? intent.agents : manifest.agents) as AgentId[];
      const selectedAgents: AgentId[] = agents.length ? agents : ['codex'];
      plans.push(...planSkillMaterializations(canonical, selectedAgents, { scope: intent?.scope ?? 'project', mode: manifest.materialization?.mode ?? 'portable', projectRoot: this.projectRoot, homeDir: homedir() }));
    }
    return plans;
  }

  async #attachVerificationProof(lock: LockfileV1): Promise<void> {
    for (const [skillId, skill] of Object.entries(lock.skills)) {
      const registry = this.registries[skill.registry];
      if (!registry?.getVerification) continue;
      skill.signing = await registry.getVerification(registryLocalId(skillId), skill.resolved);
    }
  }

  async #installUnlocked(options: InstallOptions = {}): Promise<InstallResult> {
    const manifest = await this.#manifest();
    const digest = this.#manifestDigest(manifest);
    const previous = await this.#lock();
    if (options.frozenLockfile) {
      if (!previous || previous.project.manifestDigest !== digest) throw new AunoError({ code: 'AUNO_LOCKFILE_STALE', message: 'AUNO_LOCKFILE_STALE manifest differs from lockfile', category: 'lockfile' });
      return this.#restoreUnlocked({ ...options, offline: options.offline ?? false });
    }
    const resolved = resolveManifest(manifest, await this.#registrySnapshots(), manifest.policy ?? {}, previous);
    const lock: LockfileV1 = { lockfileVersion: 1, generatedBy: `aunoskills@${this.version}`, project: { manifestDigest: digest }, skills: resolved.skills };
    await this.#attachVerificationProof(lock);
    const plans = await this.#plan(manifest, lock, options);
    for (const [skillId, skill] of Object.entries(lock.skills)) {
      skill.materializations = plans.filter((plan) => plan.skillId === skillId.split(':').at(-1)).map((plan) => ({ target: portableMaterializationTarget(this.projectRoot, plan.target), agents: plan.agents, renderer: plan.renderer, rendererVersion: plan.rendererVersion, integrity: renderPlanIntegrity(plan) }));
    }
    const lockText = stableStringify(lock);
    if (options.dryRun) return { lock, lockText, plans };
    const previousLockText = previous ? await readFile(join(this.projectRoot, 'skills-lock.json'), 'utf8') : null;
    await applyMaterializationPlans(this.projectRoot, plans, { lockfileSnapshot: previousLockText });
    await writeTextAtomic(join(this.projectRoot, 'skills-lock.json'), lockText);
    return { lock, lockText, plans };
  }

  async install(options: InstallOptions = {}): Promise<InstallResult> { return withProjectWriteLock(this.projectRoot, 'install', () => this.#installUnlocked(options)); }

  async #restoreUnlocked(options: { offline?: boolean; dryRun?: boolean } = {}): Promise<InstallResult> {
    const manifest = await this.#manifest();
    const lock = await this.#lock();
    if (!lock) throw new AunoError({ code: 'AUNO_LOCKFILE_MISSING', message: 'AUNO_LOCKFILE_MISSING', category: 'lockfile' });
    const plans = await this.#plan(manifest, lock, { offline: options.offline, approveCapabilities: true });
    const lockText = stableStringify(lock);
    if (!options.dryRun) {
      const current = await readFile(join(this.projectRoot, 'skills-lock.json'), 'utf8');
      await applyMaterializationPlans(this.projectRoot, plans, { lockfileSnapshot: current });
    }
    return { lock, lockText, plans };
  }

  async restore(options: { offline?: boolean; dryRun?: boolean } = {}): Promise<InstallResult> { return withProjectWriteLock(this.projectRoot, 'restore', () => this.#restoreUnlocked(options)); }
  async update(options: InstallOptions = {}): Promise<InstallResult> { return withProjectWriteLock(this.projectRoot, 'update', () => this.#installUnlocked(options)); }

  async remove(skillId: string): Promise<InstallResult> {
    return withProjectWriteLock(this.projectRoot, 'remove', async () => {
      const manifest = await this.#manifest();
      const lock = await this.#lock();
      if (lock) for (const [id, skill] of Object.entries(lock.skills)) if (id !== skillId && skill.dependencies?.[skillId]) throw new AunoError({ code: 'AUNO_DEPENDENCY_IN_USE', message: `AUNO_DEPENDENCY_IN_USE ${skillId} required by ${id}`, category: 'resolution' });
      delete manifest.skills[skillId];
      await writeTextAtomic(join(this.projectRoot, 'aunoskills.json'), stableStringify(manifest));
      if (lock?.skills[skillId]) {
        const ownership = await readOwnership(this.projectRoot);
        for (const target of Object.keys(ownership)) if (ownership[target].skillId === skillId.split(':').at(-1)) { await rm(target, { recursive: true, force: true }); delete ownership[target]; }
        await writeOwnership(this.projectRoot, ownership);
      }
      return this.#installUnlocked({ approveCapabilities: true });
    });
  }

  async doctor(options: { fix?: boolean } = {}): Promise<DoctorReport> {
    let report = await inspectMaterializations(this.projectRoot);
    if (options.fix && report.issues.length) { await this.restore(); report = await inspectMaterializations(this.projectRoot); }
    return report;
  }

  async audit(options: { failOn?: AuditSeverity } = {}): Promise<AuditReport> {
    const lock = await this.#lock();
    if (!lock) return { findings: [] };
    const signerStates: RegistrySignerStates = {};
    for (const skill of Object.values(lock.skills)) {
      if (!skill.signing) continue;
      const registry = this.registries[skill.registry];
      if (!registry?.getSigningKeyStatus) continue;
      signerStates[skill.registry] ??= {};
      for (const keyId of new Set([skill.signing.registryKeyId, skill.signing.manifestKeyId])) {
        signerStates[skill.registry][keyId] = await registry.getSigningKeyStatus(keyId);
      }
    }
    const report = auditLockfile(lock, signerStates);
    if (options.failOn && meetsAuditThreshold(report, options.failOn)) throw new AunoError({ code: 'AUNO_AUDIT_THRESHOLD', message: `AUNO_AUDIT_THRESHOLD ${options.failOn}`, category: 'security' });
    return report;
  }

  async rollback(): Promise<string> { return withProjectWriteLock(this.projectRoot, 'rollback', () => rollbackLatestCommittedTransaction(this.projectRoot)); }
}
