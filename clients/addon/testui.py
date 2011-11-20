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
# Pre-reqs we will tell you about when you run us:
# - Have 'selenium-server-standalone.jar' in this directory
# - Have a symlink 'firefox-binary-symlink' in this directory that points at
#    the version of firefox to use.
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

import os, os.path, subprocess, sys, time
import mozrunner

SELENIUM_POPE = None

XPI_PATH = 'deuxdrop.xpi'
OUR_PROFILE = None
ZIPPED_PROFILE = None
FIREFOX_BINARY_PATH = None
FF_SYMLINK_NAME = 'firefox-binary-symlink'
SELENIUM_JAR_PATH = 'selenium-server-standalone.jar'

SERVER_CMDLINE_SCRIPT = '../../servers/cmdline'

def _announceStep(stepName):
    print
    print '===', stepName, '==='

def kill_existing_selenium_server():
    _announceStep('Killing existing selenium server if present')
    sys.stdout.flush()
    subprocess.call("pkill -f server-standalone.*\\.jar", shell=True)

def create_xpi():
    _announceStep('Creating XPI')
    sys.stdout.flush()
    subprocess.call("./acfx xpi", shell=True)

def create_template_profile():
    '''
    Create a profile directory containing our XPI using mozrunner, then zip
    it up.  We need to create a zip file because the webdriver remote protocol
    can accept a "firefox_profile" capability payload attribute which is a
    zipped profile and doesn't like any other mechanism.

    Instead of using mozrunner, we could try and use the webdriver pythong
    binding which has its own profile building and serialization logic.  For
    now, we're just going to kick off zip manually and stick it in a file.
    All solutions are equally troublesome, but at least we don't need to add
    the python bindings as a dependency for now.
    '''
    global OUR_PROFILE, ZIPPED_PROFILE
    _announceStep('Creating Firefox profile')
    sys.stdout.flush()
    OUR_PROFILE = mozrunner.FirefoxProfile(addons=[XPI_PATH])
    print 'Profile created at', OUR_PROFILE.profile
    subprocess.call('cd %s; zip -r profile.zipped *' % (OUR_PROFILE.profile,),
                    shell=True)
    ZIPPED_PROFILE = os.path.join(OUR_PROFILE.profile, 'profile.zipped')

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
        print 'try:'
        print 'curl -o selenium-server-standalone.jar "http://code.google.com/p/selenium/downloads/detail?name=selenium-server-standalone-2.12.0.jar&can=2&q="'
        sys.exit(1)

def spawn_our_selenium_server():
    '''
    Spawn the selenium server and wait for it to become active before returning.
    '''
    global SELENIUM_POPE
    _announceStep('Spawning selenium server')
    args = [#'/usr/bin/strace', '-e', 'trace=open,stat,process', '-f',
            '/usr/bin/java',
            '-jar', SELENIUM_JAR_PATH,
            # this must have been for old-school selenium...
            #'-firefoxProfileTemplate', OUR_PROFILE.profile,
            ]
    
    print 'Invoking:', args
    sys.stdout.flush()
    SELENIUM_POPE = mozrunner.run_command(args)

    # wait for the port to be listened on
    # (we could alternatively listen for the INFO line that says this, but
    #  then we would need to use .communicate() to keep the pipes drained
    #  instead of just letting selenium reuse our stdout/stderr)
    sys.stdout.flush()
    while subprocess.call('netstat -lnt | grep :4444', shell=True):
        time.sleep(0.05)

def kill_our_selenium_server():
    _announceStep('Killing selenium server')
    SELENIUM_POPE.kill()

def figure_firefox_path():
    global FIREFOX_BINARY_PATH
    _announceStep('Figuring out what Firefox to use')
    if (not os.path.islink(FF_SYMLINK_NAME) or
            not os.path.exists(FF_SYMLINK_NAME)):
        print 'You need a symlink called:', FF_SYMLINK_NAME
        print 'It needs to point at a firefox binary.'
        sys.exit(2)
    FIREFOX_BINARY_PATH = os.path.abspath(os.path.realpath(FF_SYMLINK_NAME))

def run_ui_tests():
    _announceStep('Running UI tests')
    os.chdir(os.path.dirname(SERVER_CMDLINE_SCRIPT))
    sys.stdout.flush()
    subprocess.call(['./' + os.path.basename(SERVER_CMDLINE_SCRIPT), 'testui',
                     '--zipped-profile=' + ZIPPED_PROFILE,
                     '--firefox-binary=' + FIREFOX_BINARY_PATH])
    

def main():
    kill_existing_selenium_server()
    download_selenium_server_jar_if_needed()
    create_xpi()
    create_template_profile()
    spawn_our_selenium_server()
    figure_firefox_path()
    try:
        run_ui_tests()
    finally:
        nuke_template_profile()
        #kill_our_selenium_server()
        pass


if __name__ == '__main__':
    main()
