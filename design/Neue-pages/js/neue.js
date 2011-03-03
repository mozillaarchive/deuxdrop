
$(document).ready(function($) {

    function goPage(hash) {
        var data = hash.substr(1).split("/");
        var page = data.shift();
        var target = $('#'+page);
        var menu = $("nav li."+page);
        
        // change the menu highlight
        menu.siblings().removeClass('selected');
        menu.addClass('selected');
        
        // change the page
        target.siblings().removeClass('selected');
        target.addClass('selected');
        
        if (target.hasClass('secondary'))
            $('body').addClass('secondary');
        else
            $('body').removeClass('secondary');

        if (mail[page])
            mail[page].apply(mail, data);
    }

    // overflow
    $('.overflow').textOverflow('...',true);

    // setup the toolbar links
    $("nav li").click(function() {
        if ($(this).hasClass('back')) {
            history.go(-1);
            return;
        }
        var command = $(this).attr('data-for');
        var target = $('#'+command);
        var type = target.get(0).nodeName;
        
        if (type === "PAGE") {
            location.hash = $(this).attr('data-for');
        } else
        if (type === "TOOLBAR") {
            $(this).toggleClass("on off");
            target.toggleClass('visible');
        }
    });

    // initialize
    mail.labels();
    //mail.labels(function() {
    //    mail.messages($("#folderList li:first-child").attr('id'));
    //});


    $(window).hashchange( function(){
        goPage( location.hash ? location.hash : '#messages' );
    })
    $(window).hashchange();
    
    $("#saveSettings").click(function(evt) {
        localStorage.fullname = $('#settings input#fullname').val();
        localStorage.email = $('#settings input#email').val();
        localStorage.username = $('#settings input#username').val();
        var pw1 = $('#settings input#password').val();
        var pw2 = $('#settings input#password2').val();
        if (pw1 === pw2) {
            localStorage.password = pw1;
            alert("login stored");
        } else {
            alert("passwords do not match");
        }
    });
    $("#discardSettings").click(function(evt) {
        localStorage.fullname = "";
        localStorage.email = "";
        localStorage.username = "";
        localStorage.password = "";
        $('#settings input#fullname').val("");
        $('#settings input#email').val("");
        $('#settings input#username').val("");
        $('#settings input#password').val("");
        $('#settings input#password2').val("");
        alert("login cleared");
    });
    $("#discardMessage").click(function(evt) {
        history.go(-1);
    });
    $("#saveDraftMessage").click(function(evt) {
        alert("not implemented");
    });
    $("#sendMessage").click(function(evt) {
        mail.send({
            to: $("#to").val(),
            subject: $("#messageSubject").val(),
            message: $("#messageBody").val()
        })
    });
});

