$(document).ready(function($) {

    // overflow
    $('.overflow').textOverflow('...',true);
    
    $("nav li").click(function() {
        var current = $('page.selected').attr('id');
        $('li.back').attr('data-for', current);
        var target = $('#'+$(this).attr('data-for'));
        var type = target.get(0).nodeName;
        if (type === "PAGE") {
            // toggle to a different page
            if (target.hasClass('secondary')) {
                $('page.secondary').removeClass('selected');
                $('body').addClass('secondary');
            } else
            if (target.hasClass('popup')) {
                target.addClass('open');
            } else {
                $('page').removeClass('selected');
                $('body').removeClass('secondary');
            }
            target.addClass('selected');
            // turn off search on any page change
            $("toolbar#search").removeClass('visible');
            $('li.search').removeClass('on');
        } else
        if (type === 'TOOLBAR') {
            $(this).toggleClass("on off");
            target.toggleClass('visible');
        }
    });
    
    
    function skipme () {
    // selected state for sidebar
    $('#secondaryNav li.inbox, #secondaryNav li.labels, #secondaryNav li.settings, #secondaryNav li.compose').click(function() {
        $(this).addClass('selected');
        $(this).siblings().removeClass('selected');
        $('#composeWrap').removeClass('open');
    });
    
    // inbox interaction
    $('.inbox').click(function() {
        $('#primaryNav').addClass('messages');
        $('#primaryNav').removeClass('settings');
        $('#secondaryNav li.inbox').addClass('selected');
        $('#secondaryNav li.inbox').siblings().removeClass('selected');
        mail.showFolder($("#folderList li:first-child").attr('id'));
    });
    
    // remove messages class when clicking labels
    $('.labels').click(function() {
        mail.getFolders();
        $('#primaryNav').removeClass('messages');
        $('#primaryNav').removeClass('settings');
        $('#primaryNav').addClass('labels');
        
    });
    
    // compose interaction
    $('.compose').click(function() {
        $('#composeWrap').addClass('open');
        $('section#search').removeClass('visible');
        $('li.search').removeClass('on');
        $('input#to').focus();
    });

    $('.settings').click(function() {
        dump("clicked on settings\n");
        $('#primaryNav').removeClass('labels');
        $('#primaryNav').removeClass('messages');
        $('#primaryNav').addClass('settings');
    });
    
    // search stuff
    $('li.search.off').click(function() {
        $(this).toggleClass('on off');
        $('section#search').toggleClass('visible');
        $('.visible input.search').focus();
        $('#composeWrap').removeClass('open');
        $('.compose').removeClass('selected');
    });
    
    // toggle conversation
    $('.messagePrev.active').click(function() {
        $('.messagePrev.active').toggleClass('selected');
        $('body').toggleClass('conversationView');
    });
    
    mail.getFolders(function() {
        mail.showFolder($("#folderList li:first-child").attr('id'));
    });
    }
}); 