# How To Set Up Your Cobbler Instance

Important note!  Most people probably do not want to be setting up a cobbler
instance.  Easier options are:

* Just download the pre-built images we allegedly provide.
* Get yourself a fedora or CentOS VM, install puppet in it, then run the puppet
   steps.

## Install cobbler

* yum install cobbler cobbler-web


## Modify /etc/cobbler/settings

Change:

* "server" to be 192.168.122.1 or whatever the IP/hostname of your cobbler
   server is on the (virtual) network.  For libvirt with default settings, this
   will be 192.168.122.1.

After changing the settings, you will want to run "cobbler sync" and restart the
cobblerd daemon ("service cobblerd restart").


## Grab your distro, configure repo's.

First, download or otherwise have available the DVD image of the OS you want to
install.  For example, I downloaded centos-5.6-x86_64 and it was a 2 DVD set.
It turns out the second DVD is not required unless you are dealing with other
locales, so pretend it does not exist.

Import the distro:

    mount /path/to/dvd.iso /mnt/dvdiso
    cobbler import --path=/mnt/iso1 --arch=x86_64 --name=centos-5.6-x86_64


Mirror the repositories.  This requires a lot of network bandwidth, time, and
disk space.  There may be smarter ways to do this like some means of doing
caching proxying instead of bulk mirroring.

    CENTOS_MIRROR=http://mirror.rackspace.com/
    cobbler repo add --name=centos-5.6-x86_64-updates --priority=70 --mirror=${CENTOS_MIRROR}/CentOS/5.6/updates/x86_64/
    cobbler repo add --name=epel-5-x86_64 --priority=40 --mirror=${CENTOS_MIRROR}/epel/5/x86_64/
    cobbler reposync


## Customize the profile

The profile we created above (centos-5.6-x86_64) will, by default, reference the
sample.ks kickstart file.  We have our own that we want to use.  Also, we need
to tell it the yum repos to use.

    cobbler profile edit --name=centos-5.6-x86_64 --kickstart=\`pwd\`/basic.ks --repos="centos-5.6-x86_64-updates epel-5-x86_64"

# How To Provision Using Cobbler

This should go elsewhere or become obvious, but for now...

Define the system:

    VHOSTNAME=left
    VDNSNAME=left.raindrop.it
    sudo ./define-all-in-one-system $VHOSTNAME $VDNSNAME

Cause the VM to be populated:

    sudo koan --server=localhost --virt --virt-name $VHOSTNAME --system=$VHOSTNAME
