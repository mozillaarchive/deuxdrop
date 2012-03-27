#!/usr/bin/env python

import BaseHTTPServer
import SimpleHTTPServer
import SocketServer
import os, os.path


PORT = 8887

basey = BaseHTTPServer.BaseHTTPRequestHandler
class NeinCachingHandlerGruben(SimpleHTTPServer.SimpleHTTPRequestHandler):
    '''
    Hackjob to send a cache-control max-age of 2 whenever we send a last
    modified.
    '''
    def send_header(self, name, value):
        basey.send_header(self, name, value)
        if name == 'Last-Modified':
            basey.send_header(self, 'Cache-Control', 'max-age=2')

Handler = SimpleHTTPServer.SimpleHTTPRequestHandler

class ReusableSocketServer(SocketServer.TCPServer):
    '''
    If we control-C and then restart quickly, it's important that we allow
    reuse of the port rather than waiting for all its timeouts to clear.
    '''
    allow_reuse_address = True

httpd = ReusableSocketServer(("", PORT), NeinCachingHandlerGruben)

# if we're in the styling dir, go up a dir
if os.path.basename(os.path.abspath(os.curdir)) == 'styling':
    print 'Changing effective dir to root'
    os.chdir('..')

print "Serving on port", PORT, "browse to:"
print
print "http://localhost:" + str(PORT) + "/clients/mobileui/styling.html#!watch"
httpd.serve_forever()
