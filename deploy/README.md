## Overview

Development images and deployment configurations.  The general mechanism is:

* Machines / images are bootstrapped using [cobbler].
* Machines / images are configured using [puppet].


## Cobbler vs Puppet

We use cobbler to:

- Get the operating system on there.
- Get the machine talking on the network, including making sure it gets an IP
   address somehow (DHCP or static), giving it a hostname, and being able to
   ssh into it using public keys.
- Get puppet installed somehow.

We use puppet to:

- Specialize the machine for its role(s) by installing and configuring software.


## Supported Configurations

The configuration we currently support populating is:

* All in one: a single node that provides a server that can talk to just itself
   or other servers too.
   
We eventually also want to support:

* Cluster nodes: a production-grade multiple node setup.


## SSH Keys

We expect to find a deploy/keys/deuxdrop-deploy-key.pub file.  There are scripts
(make-new-keypair and use-my-pub-key) in that directory to assist in creating a
new keypair or use your existing RSA public key, respectively.


[cobbler]: https://fedorahosted.org/cobbler/
[puppet]: http://docs.puppetlabs.com/
