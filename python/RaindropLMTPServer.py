#!/bin/env python

from RaindropEmailProcessor import RaindropEmailProcessor
from RaindropHBaseClient import RaindropHBaseClient

from smtpd import SMTPChannel, SMTPServer
import asyncore

import os.path
from mailbox import Maildir

MAILDIR_DELIVERY_USER="~email"

class RaindropLMTPChannel(SMTPChannel):
  # LMTP commands are routed to SMTP and ESMTP commands
  def smtp_LHLO(self, arg):
    self.smtp_HELO(arg)

class RaindropLMTPServer(SMTPServer):

  def __init__(self, localaddr, remoteaddr):
    SMTPServer.__init__(self, localaddr, remoteaddr)
    self.processor = RaindropEmailProcessor()

    self.hbase = RaindropHBaseClient()

  def process_message(self, peer, mailfrom, rcpttos, data):
#    print 'Receiving message from:', peer
#    print 'Message addressed from:', mailfrom
#    print 'Message addressed to  :', rcpttos
#    print 'Message length        :', len(data)
#    print 'Message               :', data

    message = self.processor.process(data)

    # Each recipient is a local user we need to deliver this message to.
    for user in rcpttos:
      [username, domain] = user.split("@")
      self._maildir_delivery(username, domain, data)
      self._hbase_delivery(username, domain, message, data)

    # Returning nothing indicates successful delivery
    return

  def _hbase_delivery(self, username, domain, message, data):
    self.hbase.save(username, domain, message, data)

  def _maildir_delivery(self, username, domain, data):
    try:
      path = os.path.join(os.path.expanduser(MAILDIR_DELIVERY_USER), domain, username)
      mdir = Maildir(path)
      mdirid = mdir.add(data)
      print "Maildir Delivered %s@%s %s/%s" % (username, domain, path, mdirid)
    except:
      # XXX log errors with maildir but continue
      print "Maildir delivery error %s@%s " % (username, domain)

  def handle_accept(self):
    conn, addr = self.accept()
    channel = RaindropLMTPChannel(self, conn, addr)

if __name__ == '__main__':
  server = RaindropLMTPServer(('localhost', 10025), None)
  asyncore.loop()
