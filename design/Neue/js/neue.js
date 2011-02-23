$(document).ready(function($) {

    // overflow
    $(".overflow").textOverflow(null,true);

    // size sections to 100% height of window
    $(window).bind("load resize", function() {
        var h = $(window).height();
        $("#primaryNav, #conversation, #primaryNav section").css({ "height" : h });
    });
    
    // size listWrap 
    $(window).bind("load resize", function() {
        var w = $("#primaryNav").width();
        $("#listWrap").css({ "width" : (w*2+2) });
    });
    
    // selected state for sidebar
    $("#secondaryNav li.inbox, #secondaryNav li.labels").click(function() {
        $(this).addClass('selected');
        $(this).siblings().removeClass('selected');
    });
    
    // inbox interaction
    $(".inbox").click(function() {
        $("#primaryNav").addClass('messages');
        $("#secondaryNav li.inbox").addClass('selected');
        $("#secondaryNav li.inbox").siblings().removeClass('selected');
    });
    
    // remove messages class when clicking labels
    $(".labels").click(function() {
        $("#primaryNav").removeClass('messages');
        $("#primaryNav").addClass('labels');
        
    });
    
    // toggle conversation
    $(".messagePrev.active").click(function() {
        $(".messagePrev.active").toggleClass("selected");
        $("body").toggleClass("conversationView");
    });
    
}); 