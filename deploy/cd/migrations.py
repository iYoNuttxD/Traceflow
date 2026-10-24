"""Exact schema-transition contract. No SQL, credentials or production side effects."""
import datetime as dt
import hashlib
import re
from contract import canonical, need


def chain(rows):
    need(isinstance(rows, list) and rows, 'MIGRATION_CHAIN_EMPTY')
    result = {}
    for row in rows:
        need(isinstance(row, dict) and set(row) == {'name', 'sha256'}, 'MIGRATION_FIELDS')
        name, digest = row['name'], row['sha256']
        need(isinstance(name, str) and re.fullmatch(r'[0-9][a-zA-Z0-9_]{0,190}', name), 'MIGRATION_NAME')
        need(isinstance(digest, str) and re.fullmatch(r'[a-f0-9]{64}', digest), 'MIGRATION_CHECKSUM')
        need(name not in result and name.lower() not in {n.lower() for n in result}, 'MIGRATION_DUPLICATE')
        result[name] = digest
    return result


def additions(previous, candidate):
    old, new = chain(previous['migrations']), chain(candidate['migrations'])
    need(all(new.get(name) == digest for name, digest in old.items()), 'MIGRATION_HISTORY_CHANGED')
    return [{'name': n, 'sha256': new[n]} for n in sorted(new.keys() - old.keys())]


def transition(plan, previous, candidate, app_sha, plan_sha, backup, restore, now=None):
    need(hashlib.sha256(canonical(plan)).hexdigest() == plan_sha, 'TRANSITION_DIGEST')
    need(plan.get('formatVersion') == 1 and plan.get('operation') == 'migrate-and-promote-clean', 'TRANSITION_FORMAT')
    need(plan.get('appSha') == app_sha and plan.get('from') == previous and plan.get('to') == candidate, 'TRANSITION_IDENTITY')
    need(plan.get('externalWritersExcluded') is True, 'TRANSITION_EXTERNAL_WRITERS')
    from preservation import enabled, SOURCE_SCHEMA, TARGET_SCHEMA
    if previous['schemaSha256']==SOURCE_SCHEMA and candidate['schemaSha256']==TARGET_SCHEMA:
        need(plan.get('dataPreservation') is not None, 'TRANSITION_DATA_POLICY_REQUIRED')
    enabled(plan)
    pending = additions(previous, candidate)
    need(pending and plan.get('added') == pending, 'TRANSITION_ADDITIONS')
    need(plan.get('upgradeEvidenceSha256') and re.fullmatch(r'[a-f0-9]{64}', plan['upgradeEvidenceSha256']), 'TRANSITION_HOMOLOGATION')
    need(plan.get('previousAppCompatibleWithTarget') is True, 'TRANSITION_APPLICATION_COMPATIBILITY')
    now = now or dt.datetime.now(dt.timezone.utc)
    issued, expires = (dt.datetime.fromisoformat(plan[k]) for k in ('issuedAt', 'expiresAt'))
    need(issued.tzinfo is not None and expires.tzinfo is not None and issued <= now < expires, 'TRANSITION_EXPIRED')
    need(0 < (expires-issued).total_seconds() <= 86400, 'TRANSITION_VALIDITY')
    need(backup.get('status') == 'SUCCESS' and backup.get('externalReadback') is True, 'TRANSITION_BACKUP')
    binding = {k: backup[k] for k in ('id', 'cipherSha256', 'manifestSha256')}
    need(plan.get('backup') == binding, 'TRANSITION_BACKUP_IDENTITY')
    need(restore.get('status') == 'ISOLATED_RESTORE_PASS' and all(restore.get(k) == v for k,v in binding.items()), 'TRANSITION_RESTORE_IDENTITY')
    need(all(restore.get(k) is True for k in ('allTableDataHashesEqual', 'allStructuresEqual', 'persistentFileHashesEqual', 'configurationHashesEqual', 'cleanup')), 'TRANSITION_RESTORE_INCOMPLETE')
    need(restore.get('productionDestination') is False, 'TRANSITION_RESTORE_DESTINATION')
    captured = dt.datetime.fromisoformat(backup['finishedAt'])
    need(0 <= (now-captured).total_seconds() <= 26*3600, 'TRANSITION_BACKUP_STALE')
    return pending
