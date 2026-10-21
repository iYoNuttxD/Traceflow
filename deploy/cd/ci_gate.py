#!/usr/bin/env python3
"""Select an exact SHA. Current immutable app has narrowly scoped CD validation;
new functional revisions must additionally have the established CI jobs on that SHA."""
import json,os,re,subprocess,sys
BASELINE='9bc3dad199566afc6fa43d67abba400665d843ea'
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def validate(sha):
 if not re.fullmatch('[a-f0-9]{40}',sha):raise ValueError('FULL_SHA_REQUIRED')
 if git('rev-parse',sha+'^{commit}')!=sha:raise ValueError('COMMIT_IDENTITY')
 # Baseline contains no new functionality. Every other revision needs full existing CI.
 if sha!=BASELINE:
  raw=subprocess.check_output(['gh','api',f'repos/iYoNuttxD/Traceflow/commits/{sha}/check-runs?per_page=100'],text=True)
  checks=json.loads(raw)['check_runs'];required={'Quality','Backend Tests','Frontend Tests','Supply Chain'}
  runs=json.loads(subprocess.check_output(['gh','api',f'repos/iYoNuttxD/Traceflow/actions/runs?head_sha={sha}&event=push&per_page=100'],text=True))['workflow_runs']
  valid={str(x['id']) for x in runs if x['head_sha']==sha and x['path']=='.github/workflows/ci.yml' and x['conclusion']=='success'}
  if not valid:raise ValueError('EXACT_SOURCE_PUSH_CI_REQUIRED')
  for name in required:
   matches=[x for x in checks if x['name']==name and x['app']['slug']=='github-actions']
   if not matches or max(matches,key=lambda x:x['id'])['conclusion']!='success' or not any('/runs/'+rid+'/' in max(matches,key=lambda x:x['id'])['details_url'] for rid in valid):raise ValueError('EXACT_SHA_CI_REQUIRED_'+name.replace(' ','_'))
 return {'appSha':sha,'baselinePreviouslyApproved':sha==BASELINE,'mandatoryCurrentValidation':'lint, targeted runtime tests, dependency audit, native double build, isolated schema/readiness, CD rollback tests'}
if __name__=='__main__':print(json.dumps(validate(sys.argv[1])))
