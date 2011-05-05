# Puppet Configuration Management

## Current Strategy

We are taking a page from Atul's Hackasaurus puppet scripts (which can be found
at https://github.com/hackasaurus/hackasaurus-puppet-data) and propagating our
entire puppet subdirectory to the target as a tarball.  Once it gets there, we
use the local apply mechanism.  The major difference is that all deuxdrop source
code will be forced onto the target from our local checkout rather than pulled
from the internet.

## Directory Purposes

Everything is best practices obeyin' save for:

- module-bundles: All of its children are added as module-paths.  It exists
   because puppet-npm's repo has the module itself in a subdir.

## Goals (Things not to lose when improving this)

Allow a developer to configure a VM:

- Without needing to stand up a puppet server themself.
- Using the code they are currently developing.


Nice to have:

- Fast/easy way to propagate changed source to the VM that takes on the order of
   seconds.
