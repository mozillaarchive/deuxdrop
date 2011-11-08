#!/usr/bin/python
#
# Perform a UI test using Selenium.
#
# There is no particularly good reason this is a shell script rather than
#  built-in to our test framework.
#
# Pre-reqs:
# - Have sourced Jetpack's bin/activate script in your shell.
#
# Steps:
# - Kill any existing selenium server.
# - Create an XPI for the jetpack. (./acfx xpi)
# - Create a firefox profile with the XPI crammed in it (using profilehelper.py)
#    (We rely on bin/activate having set PYTHONPATH so our script can get at
#     mozrunner to make it do most of the legwork for us.)
# - Spin up the new selenium server, pointing it at our XPI for profile use.
# - Invoke our node server 'cmdline' driver with 'uitest' to actually run the
#    unit tests with UI test magic enabled and using UI test directories, etc.

import os, os.path, subprocess
import mozrunner

SELENIUM_POPE = None

XPI_PATH = 'deuxdrop.xpi'
OUR_PROFILE = None
SELENIUM_JAR_PATH = 'selenium-server-standalone.jar'

SERVER_CMDLINE_SCRIPT = '../../servers/cmdline'

def _announceStep(stepName):
    print
    print '===', stepName, '==='

def kill_existing_selenium_server():
    _announceStep('Killing existing selenium server if present')
    subprocess.call("pkill -f server-standalone.*\\.jar", shell=True)

def create_xpi():
    _announceStep('Creating XPI')
    subprocess.call("./acfx xpi", shell=True)

def create_template_profile():
    global OUR_PROFILE
    _announceStep('Creating Firefox profile')
    OUR_PROFILE = mozrunner.FirefoxProfile(addons=[XPI_PATH])
    print 'Profile created at', OUR_PROFILE.profile

def nuke_template_profile():
    OUR_PROFILE.cleanup()
    pass

def download_selenium_server_jar_if_needed():
    if not os.path.exists(SELENIUM_JAR_PATH):
        # XXX consider automatically downloading; I am punting on this right
        #  now because I'm not sure if the public release is good enough or
        #  if trunk builds are required...
        print '***'
        print 'You need to download selenium-server-standalone.jar'
        print ' from somewhere and make sure it is named like that.'
        print '***'
        sys.exit(1)

def spawn_our_selenium_server():
    global SELENIUM_POPE
    _announceStep('Spawning selenium server')
    args = ['/usr/bin/java',
            '-jar', SELENIUM_JAR_PATH,
            '-firefoxProfileTemplate', OUR_PROFILE.profile,
            ]
    
    print 'Invoking:', args
    SELENIUM_POPE = mozrunner.run_command(args)

def kill_our_selenium_server():
    _announceStep('Killing selenium server')
    SELENIUM_POPE.kill()

def run_ui_tests():
    _announceStep('Running UI tests')
    os.chdir(os.path.dirname(SERVER_CMDLINE_SCRIPT))
    subprocess.call(['./' + os.path.basename(SERVER_CMDLINE_SCRIPT), 'testui'])
    

def main():
    kill_existing_selenium_server()
    create_xpi()
    create_template_profile()
    download_selenium_server_jar_if_needed()
    spawn_our_selenium_server()
    try:
        run_ui_tests()
    finally:
        nuke_template_profile()
        kill_our_selenium_server()


if __name__ == '__main__':
    main()
