<?php

/* Automatically find controllers */
$config = array('ctrl_dir' => dirname(__FILE__));
function __autoload($class_name)
{
    global $config;
    require_once $config['ctrl_dir'] . '/' . strtolower($class_name) . '.php';
}

function index()
{
    throw new Exception("nothing to see here.");
}

require_once dirname(__FILE__) . '/apimap.php';

$map = new api($config);
$map->connect('default', '', NULL, 'index');

# Add a simple route, to test visit:
# http://example.net/routemap/index.php?news/some_title
$map->connect('message', '/message/:mid', 'storage', 'get_message');
$map->connect('message_list', '/folder/:name', 'storage', 'list_messages');
$map->connect('folder_list', '/folder', 'storage', 'list_folders');

# e.g. http://example.net/routemap/index.php?news/2008/01/01
//phpinfo();
//echo $_SERVER['PATH_INFO'];
//print_r($map->_urls);
$map->dispatch($_SERVER['PATH_INFO']);

//print $map->url_for('folder_list');

//print $map->dispatch('folder/');
//print $map->dispatch('folder/INBOX.friends');
//print $map->dispatch('message/1');
