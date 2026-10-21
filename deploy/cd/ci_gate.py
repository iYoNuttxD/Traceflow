#!/usr/bin/env python3
"""Exact source CI binding. Polls only read-only CI state, never deploy retries."""
import json,re,subprocess,sys,time
BASELINE='9bc3dad199566afc6fa43d67abba400665d843ea'
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
def api(path):return json.loads(subprocess.check_output(['gh','api','repos/iYoNuttxD/Traceflow/'+path],text=True))
def source_ci(sha,timeout=1200):
 deadline=time.monotonic()+timeout
 while True:
  runs=[x for x in api(f'actions/runs?head_sha={sha}&event=push&per_page=100')['workflow_runs'] if x['head_sha']==sha and x['path']=='.github/workflows/ci.yml' and x['event']=='push']
  latest=max(runs,key=lambda x:x['id']) if runs else None
  if latest and latest['status']=='completed':
   if latest['conclusion']!='success':raise ValueError('EXACT_SOURCE_CI_NOT_SUCCESSFUL')
   checks=api(f'commits/{sha}/check-runs?per_page=100')['check_runs']
   for name in {'Quality','Backend Tests','Frontend Tests','Supply Chain'}:
    matches=[x for x in checks if x['name']==name and x['app']['slug']=='github-actions' and '/runs/'+str(latest['id'])+'/' in x['details_url']]
    if not matches or max(matches,key=lambda x:x['id'])['conclusion']!='success':raise ValueError('EXACT_SHA_CI_REQUIRED_'+name.replace(' ','_'))
   return latest['id']
  if time.monotonic()>=deadline:raise ValueError('EXACT_SOURCE_PUSH_CI_REQUIRED')
  time.sleep(min(30,max(0,deadline-time.monotonic())))
def validate(sha):
 if not re.fullmatch('[a-f0-9]{40}',sha):raise ValueError('FULL_SHA_REQUIRED')
 if git('rev-parse',sha+'^{commit}')!=sha or git('rev-parse','HEAD')!=sha:raise ValueError('COMMIT_IDENTITY')
 run=None if sha==BASELINE else source_ci(sha)
 return {'appSha':sha,'sourceCiRun':run,'baselinePreviouslyApproved':sha==BASELINE,'mandatoryCurrentValidation':'lint, targeted runtime tests, dependency audit, native double build, isolated schema/readiness, CD rollback tests'}
if __name__=='__main__':print(json.dumps(validate(sys.argv[1])))
