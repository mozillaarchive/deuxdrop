# How To Set Up Your Cobbler Instance

Important note!  Most people probably do not want to be setting up a cobbler
instance.  Easier options are:

* Just download the pre-built images we allegedly provide.
* Get yourself a fedora or CentOS VM, install puppet in it, then run the puppet
   steps.

## Install cobbler

Install cobbler:

    yum install cobbler cobbler-web koan

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

One super important thing to keep in mind is that you may still need to customize
the profile as seen below if your deuxdrop directory lives someplace different
than it did on the master.  If this is the case, then if you perform any
subsequent replications, you may want to leave off the profile syncing unless
you want to re-apply that change:

    cobbler replicate --master=HOSTNAME --distros=* --repos=* --image=*


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


# Virtualization

## Install Stuff

If you want to do virtual stuff on fedora, like for testing, you should:

    yum install @virtualization
    service libvirtd start

Additionally, you will probably want to configure your firewall to trust the
"virbr0" device used by libvirt.  Use system-config-firewall-tui or
system-config-firewall to add "virbr0" as a "trusted interface".  It is not in
the default list of options, so you will need to "add" it yourself and then
mark it as trusted.  Be sure to apply the changes once done.


## Provisioning Using Cobbler

This should go elsewhere or become obvious, but for now...

Make sure you setup your SSH keeys in the deploy/keys directory already!  See
deploy/README.md for more info if this does not sound familiar to you.

Define the system:

    VHOSTNAME=left
    VDNSNAME=left.raindrop.it
    sudo ./define-all-in-one-system $VHOSTNAME $VDNSNAME

Cause the VM to be populated:

    sudo koan --server=localhost --virt --virt-name $VHOSTNAME --system=$VHOSTNAME

If you want to watch the installation happen, you can use "virt-manager" to find
the system and look at its display.


## Destroying VMs

If you are tired of the VM, you can nuke it from existence by doing:

    sudo virsh destroy $VHOSTNAME
    sudo virsh undefine $VHOSTNAME

You may also want to kill the cobbler system definition:
    
    cobbler system remove --name $VHOSTNAME
