$(document).ready(function($) {

    // overflow
    $('.overflow').textOverflow(null,true);
    
    // size listWrap 
    $(window).bind('load resize', function() {
        var w = $('#primaryNav').width();
        $('#listWrap').css({ 'width' : (w*3+3) });
    });
    
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
}); 