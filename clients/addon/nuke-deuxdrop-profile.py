#!/usr/bin/python
#
# Blow away all traces of deuxdrop's state from a given profile directory.
# This translates to nuking:
# - The IndexedDB directory for our origin.
# - The localStorage info for our origin using sqlite.

import os, os.path, subprocess, sys, shutil

IDB_ORIGIN = 'resource+++jid1-bjyvsluajwq9bg-at-jetpack-deuxdrop-data'

LS_SCOPE = 'atad-pordxued-kcaptej-ta-gb9qwjaulsvyjb-1dij.:resource'
# no escaping required for the above
NUKE_SQL = "DELETE FROM webappsstore2 WHERE scope = '%s'" % (LS_SCOPE,)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print 'Tell us where!'
        sys.exit(1)

    profile_path = sys.argv[1]
    indexeddb_path = os.path.join(profile_path, 'indexedDB')
    if not os.path.isdir(profile_path) or not os.path.isdir(indexeddb_path):
        print 'Does not look like a profile dir to me!'
        sys.exit(2)

    our_idb_path = os.path.join(indexeddb_path, IDB_ORIGIN)
    if os.path.isdir(our_idb_path):
        shutil.rmtree(our_idb_path)

    ls_path = os.path.join(profile_path,  'webappsstore.sqlite')
    # yes, we could use the sqlite module too...
    subprocess.call(['/usr/bin/sqlite3', ls_path, NUKE_SQL])
    
