#!/usr/bin/env python

# See README.md for more details, but basically, we want to ssh into the given
#  server (using the key from deploy/keys), propagating the contents of our
#  deploy/puppet sub-tree via a catted tarball, then run puppet on the server.

import os, os.path
import sys
import subprocess

MY_DIR = os.path.dirname(__file__)
KEY_DIR = os.path.join(MY_DIR, '../keys')
PRIV_KEY_FILE = os.path.join(KEY_DIR, 'deuxdrop-deploy-key')

REMOTE_PUPPET_DIR = '/var/deuxdrop-puppet'

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
        cwd=os.path.join(MY_DIR, '..'), # this just gets the puppet tree...
        stdout=subprocess.PIPE
        )

    ssh_args = ['ssh']
    if os.path.isfile(PRIV_KEY_FILE):
        ssh_args.extend(['-i', PRIV_KEY_FILE])
    ssh_args.append('root@%s' % server)

    # send the file
    subprocess.check_call(ssh_args +  ['cat > payload.tgz'],
                          stdin=tarfile.stdout)

    # nuke old tree, extract, run puppet
    remote_cmds = [
        'rm -rf %s' % (REMOTE_PUPPET_DIR,),
        'mkdir %s' % (REMOTE_PUPPET_DIR,),
        'cd %s' % (REMOTE_PUPPET_DIR,),
        'tar -xvf /root/payload.tgz',
        'rm /root/payload.tgz',
        'python tools/setup_server.py'
        ]
    result = subprocess.call(ssh_args + [';'.join(remote_cmds)])
    if result != 0:
        print "Deployment failed."
        sys.exit(1)
