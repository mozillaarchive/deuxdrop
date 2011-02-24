$(document).ready(function($) {

    // overflow
    $('.overflow').textOverflow(null,true);
    
    // size listWrap 
    $(window).bind('load resize', function() {
        var w = $('#primaryNav').width();
        $('#listWrap').css({ 'width' : (w*2+2) });
    });
    
    // selected state for sidebar
    $('#secondaryNav li.inbox, #secondaryNav li.labels, #secondaryNav li.compose').click(function() {
        $(this).addClass('selected');
        $(this).siblings().removeClass('selected');
        $('#composeWrap').removeClass('open');
    });
    
    // inbox interaction
    $('.inbox').click(function() {
        $('#primaryNav').addClass('messages');
        $('#secondaryNav li.inbox').addClass('selected');
        $('#secondaryNav li.inbox').siblings().removeClass('selected');
    });
    
    // remove messages class when clicking labels
    $('.labels').click(function() {
        $('#primaryNav').removeClass('messages');
        $('#primaryNav').addClass('labels');
        
    });
    
    // compose interaction
    $('.compose').click(function() {
        $('#composeWrap').addClass('open');
        $('section#search').removeClass('visible');
        $('li.search').removeClass('on');
        $('input#to').focus();
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
    
}); 