import os
import sys
import platform
import subprocess

MY_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.abspath('%s/..' % MY_DIR)
BUNDLE_DIR = os.path.join(ROOT_DIR, 'module-bundles')

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

    # This script used to be friendly and would install required packages on
    #  ubuntu; we might want to be friendly and add that and/or some other
    #  poor man's setup stuff.

    # add all of the module-bundles subdirs as module paths.
    module_paths = []
    for dirname in os.listdir(BUNDLE_DIR):
        dirpath = os.path.join(BUNDLE_DIR, dirname)
        if os.path.isdir(dirpath):
            module_paths.append(dirpath)

    run(['puppet',
         ## we are on 0.25.5 and lack apply, apparently
         #'apply',
         '-v', '-d',
         '--modulepath', ':'.join(module_paths),
         '%s/manifests/all-in-one.pp' % ROOT_DIR])
    print "Server configuration successfully updated."
