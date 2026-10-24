#!/usr/bin/env python3
"""Synthetic cgroup failure test, ONLY in the existing local Lima builder.
Does not start TraceFlow, Nginx or MySQL; proves systemd lifecycle semantics only.
"""
import argparse,hashlib,json,os,platform,shutil,socket,subprocess,sys,time,uuid
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from activation_window import systemd_command
from operational_io import private_write
from release_contract import require,encoded,atomic_json,file_digest

def cmd(args,check=True):
    p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=25)
    require(not check or p.returncode==0,'SYNTHETIC_COMMAND_FAILED');return p.stdout.strip()
def props(unit):return dict(l.split('=',1) for l in cmd(['systemctl','show',unit,'-p','ActiveState','-p','MainPID','-p','Result']).splitlines())

def main():
    require(os.geteuid()==0 and socket.gethostname()=='lima-tf072c' and platform.machine()=='aarch64','LOCAL_LIMA_ONLY')
    require('9.8' in Path('/etc/oracle-release').read_text(),'ORACLE98_ONLY')
    parent=Path('/opt/traceflow');require(not parent.exists(),'SYNTHETIC_TARGET_EXISTS')
    rid='20261017T000000Z-'+'0'*40+'-'+uuid.uuid4().hex[:12]
    base=parent/'releases'/rid/'deploy/scripts';base.mkdir(parents=True,mode=0o700)
    marker=parent/'owner.json';private_write(marker,encoded({'task':'OCI0710_SYNTHETIC','releaseId':rid}))
    script=base/'release.py'
    code='''import json,os,signal,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[4]
run=sys.argv[-1];folder=root/run
units=['traceflow-test-'+run+'-api.service','traceflow-test-'+run+'-worker.service']
def call(args):
 p=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
 if p.returncode:raise RuntimeError('SYNTHETIC_COMMAND')
def write(path,data):
 with path.open('x') as f:f.write(data);f.flush();os.fsync(f.fileno())
 fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
if sys.argv[1]=='finalize-first':
 if not (folder/'verified').exists():
  for u in units:call(['systemctl','stop',u])
  (folder/'page').write_text('temporary')
  if (folder/'current').is_symlink():(folder/'current').unlink()
 write(folder/'closed','closed')
else:
 for u in units:
  call(['systemd-run','--quiet','--unit='+u,'--property=Type=exec','--property=KillMode=control-group','--property=LimitCORE=0',
        '/usr/bin/python3','-c','import subprocess,time;subprocess.Popen(["/usr/bin/sleep","60"]);time.sleep(60)'])
 (folder/'current').symlink_to(folder/'new-release');(folder/'page').write_text('production')
 write(folder/'started','started')
 mode=(folder/'mode').read_text()
 if mode=='verified':write(folder/'verified','verified')
 elif mode=='failed':sys.exit(1)
 elif mode=='killed':os.kill(os.getpid(),signal.SIGKILL)
 else:time.sleep(60)
'''
    private_write(script,code.encode());units=[];results=[]
    try:
        for mode in ('verified','failed','killed','timeout'):
            run=uuid.uuid4().hex;folder=parent/run;folder.mkdir(mode=0o700)
            private_write(folder/'mode',mode.encode());private_write(folder/'page',b'temporary')
            controller='traceflow-first-'+run+'.service'
            writers=['traceflow-test-'+run+'-'+kind+'.service' for kind in ('api','worker')]
            units.extend([controller,*writers])
            argv=systemd_command(script,run,3 if mode=='timeout' else 20);cmd(argv)
            end=time.monotonic()+35
            while not (folder/'closed').exists() and time.monotonic()<end:time.sleep(.1)
            require((folder/'closed').is_file(),'SYNTHETIC_FINALIZER_MISSING')
            for u in writers:
                state=props(u)
                require(state['MainPID']!='0' if mode=='verified' else state['MainPID']=='0','SYNTHETIC_WRITER_RECOVERY')
                if mode=='verified':cmd(['systemctl','stop',u])
                require(props(u)['MainPID']=='0','SYNTHETIC_PROCESS_REMAINING')
                # MainPID zero alone is not proof of an empty independent cgroup.
                cg=cmd(['systemctl','show',u,'-p','ControlGroup','--value'])
                if cg:
                    procs=Path('/sys/fs/cgroup')/cg.lstrip('/')/'cgroup.procs'
                    require(not procs.exists() or not procs.read_text().strip(),'SYNTHETIC_DESCENDANT_REMAINING')
            require((folder/'page').read_text()==('production' if mode=='verified' else 'temporary'),'SYNTHETIC_PAGE_RECOVERY')
            require((folder/'current').is_symlink()==(mode=='verified'),'SYNTHETIC_LINK_RECOVERY')
            results.append({'scenario':mode,'status':'PASS','controller':props(controller)['Result'],'independentCgroupsEmpty':True,'durableReceipt':True})
        return {'status':'SYSTEMD_SYNTHETIC_PASS','platform':platform.machine(),'os':Path('/etc/oracle-release').read_text().strip(),
                'systemd':cmd(['systemctl','--version']).splitlines()[0],'results':results,
                'scope':'systemd recipe; synthetic controller and page, no Nginx or database','productionHomologation':False}
    finally:
        for u in units:
            cmd(['systemctl','stop',u],False);require(props(u)['MainPID']=='0','SYNTHETIC_CLEANUP_PROCESS')
            cmd(['systemctl','reset-failed',u],False)
        require(json.loads(marker.read_text())=={'task':'OCI0710_SYNTHETIC','releaseId':rid} and not parent.is_symlink(),'SYNTHETIC_CLEANUP_OWNER')
        shutil.rmtree(parent)
if __name__=='__main__':
    try:print(json.dumps(main()))
    except BaseException as e:print(json.dumps({'status':'FAIL','code':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));sys.exit(1)
