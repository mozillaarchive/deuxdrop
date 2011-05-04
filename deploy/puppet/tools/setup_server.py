import os
import sys
import platform
import subprocess

MY_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.abspath('%s/..' % MY_DIR)
REQUIRED_PACKAGES = [
    "git",
    "puppet"
    ]

def ensure(assertion, msg):
    if not assertion:
        print "ERROR: %s" % msg
        sys.exit(1)

def prefer(assertion, msg):
    if not assertion:
        print >> sys.stderr, "WARNING: %s" % msg

def run(cmdline, *args, **kwargs):
    print "Running '%s'..." % ' '.join(cmdline)
    sys.stdout.flush()
    sys.stderr.flush()
    result = subprocess.call(cmdline, *args, **kwargs)
    if result != 0:
        print "Process '%s' returned exit code %d, aborting." % (
            cmdline[0],
            result
            )
        sys.exit(1)

if __name__ == '__main__':
    print "Examining system configuration..."

    ensure(os.geteuid() == 0, 'This script must be run as root.')
    prefer(platform.platform().endswith('-Ubuntu-10.10-maverick'),
           'The platform should be Ubuntu 10.10 (maverick).')
    os.environ['DEBIAN_FRONTEND'] = 'noninteractive'
    run(['apt-get', '-q', '-y', 'install'] + REQUIRED_PACKAGES)
    run(['puppet', 'apply', '-v', '-d',
         '--modulepath', '%s/modules' % ROOT_DIR,
         '%s/manifests/site.pp' % ROOT_DIR])
    print "Server configuration successfully updated."
