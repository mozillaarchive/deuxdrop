#platform=x86, AMD64, or Intel EM64T
# System authorization information
auth  --useshadow  --enablemd5
# System bootloader configuration
bootloader --location=mbr
# Partition clearing information
clearpart --all --initlabel
# Use text mode install
text
# Firewall configuration
firewall --enabled
# Run the Setup Agent on first boot
firstboot --disable
# System keyboard
keyboard us
# System language
lang en_US
# Use network installation
url --url=$tree
# If any cobbler repo definitions were referenced in the kickstart profile, include them here.
$yum_repo_stanza
# Network information
$SNIPPET('network_config')
# Reboot after installation
reboot

#Root password
rootpw --iscrypted $default_password_crypted
# SELinux configuration
selinux --disabled
# Do not configure the X Window System
skipx
# System timezone
timezone  America/Los_Angeles
# Install OS instead of upgrade
install
# Clear the Master Boot Record
zerombr
# Allow anaconda to partition the system as needed
autopart


%pre
$SNIPPET('log_ks_pre')
$kickstart_start
$SNIPPET('pre_install_network_config')
# Enable installation monitoring
$SNIPPET('pre_anamon')

%packages
$SNIPPET('func_install_if_enabled')
-sendmail
ruby
ruby-libs
puppet
facter
ruby-shadow
rubygems

%post
$SNIPPET('log_ks_post')
# Start yum configuration 
$yum_config_stanza
# End yum configuration
$SNIPPET('post_install_kernel_options')
$SNIPPET('post_install_network_config')
$SNIPPET('func_register_if_enabled')
$SNIPPET('download_config_files')
$SNIPPET('koan_environment')
$SNIPPET('cobbler_register')
# Enable post-install boot notification
$SNIPPET('post_anamon')
# Turn on dhclient defaults so we get the hostname submitted
echo 'send host-name "$hostname";' > /etc/dhclient.conf
# ssh keys
cd /root
mkdir --mode=700 .ssh
cat >> .ssh/authorized_keys << "PUBLIC_KEY"
$sshpubkeyline
PUBLIC_KEY
chmod 600 .ssh/authorized_keys
# only allow login via pubkeys
cat >> /etc/ssh/sshd_config << "SSHCONFIG"
Protocol 2
SyslogFacility AUTHPRIV
PasswordAuthentication no
ChallengeResponseAuthentication no
SSHCONFIG
# nuke all the non-cobbler yum repositories so we only use our mirrors
rm -f /etc/yum/repos.d/*
# Start final steps
$kickstart_done
# End final steps
