# How To Set Up Your Cobbler Instance

Important note!  Most people probably do not want to be setting up a cobbler
instance.  Easier options are:

* Just download the pre-built images we allegedly provide.
* Get yourself a fedora or CentOS VM, install puppet in it, then run the puppet
   steps.

## Install cobbler

Install cobbler:

    yum install cobbler cobbler-web

Start the cobbler daemon

    service cobblerd start
    
You may need to start httpd if it isn't already started...

    service httpd start


## Modify /etc/cobbler/settings

Change:

* "server" to be 192.168.122.1 or whatever the IP/hostname of your cobbler
   server is on the (virtual) network.  For libvirt with default settings, this
   will be 192.168.122.1.

After changing the settings, you will want to run "cobbler sync" and restart the
cobblerd daemon ("service cobblerd restart").

## Replicate from another server

If you already have a cobbler server setup where you have completed the distro,
repo, and profile configuration, then you can simply mirror that server.  To
do this...

Make sure that the server you are replicating from has rsync enabled by:

* changing 'disable' to 'no' in /etc/xinetd.d/rsync (as "cobbler check" tells
   you to do) and restarting xinetd ("service xinetd restart")
* making sure the firewall has a hole in it for rsync (port 873) using
   either: system-config-firewall-tui, system-config-firewall, or some other
   command line tool that I have forgotten.

The rsync daemon's /etc/rsyncd.conf file should be under management by cobbler
and only contain cobbler paths (plus anything you add to
/etc/cobbler/rsyncd.template) and so should be safe as long as there are no
flaws in the implementation of the rsync daemon before it drops privileges.

You may need to chmod the files involved so that if/when rsyncd changes its uid
it can still read the files.

    chmod a+r -R /var/www/cobbler/*_mirror


Then, on the server to replicate to, you can run:

    cobbler replicate --master=HOSTNAME --distros=* --profiles=* --repos=* --image=*


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
