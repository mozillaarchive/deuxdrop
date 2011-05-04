#!/usr/bin/env python

import os
import sys
import subprocess

MY_DIR = os.path.dirname(__file__)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print "usage: %s <server-name>" % sys.argv[0]
        sys.exit(1)
    server = sys.argv[1]

    # We're going to have to use tar here instead of git archive,
    # as git archive doesn't deal with submodules and the
    # third-party git-archive-all.sh script doesn't seem to
    # support OS X.
    tarfile = subprocess.Popen(
        ['tar', 'zcv', '--exclude', '.git*', '.'],
        cwd=os.path.join(MY_DIR, '..'),
        stdout=subprocess.PIPE
        )

    ssh_args = ['ssh', 'root@%s' % server]
    subprocess.check_call(ssh_args +  ['cat > payload.tgz'],
                          stdin=tarfile.stdout)
    remote_cmds = [
        'rm -rf /var/hackasaurus-puppet-data',
        'mkdir /var/hackasaurus-puppet-data',
        'cd /var/hackasaurus-puppet-data',
        'tar -xvf /root/payload.tgz',
        'rm /root/payload.tgz',
        'python tools/setup_server.py'
        ]
    result = subprocess.call(ssh_args + [';'.join(remote_cmds)])
    if result != 0:
        print "Deployment failed."
        sys.exit(1)
