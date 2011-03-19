
// pages are attached to a page in the dom, and handle all dom manipulation

String.prototype.wordWrap = function(m, b, c){
    var i, j, s, r = this.split("\n");
    if(m > 0) for(i in r){
        for(s = r[i], r[i] = ""; s.length > m;
            j = c ? m : (j = s.substr(0, m).match(/\S*$/)).input.length - j[0].length
            || m,
            r[i] += s.substr(0, j) + ((s = s.substr(j)).length ? b : "")
        );
        r[i] += s;
    }
    return r.join("\n");
};

var pages = {
    pages: {},
    show: function goPage(id, data) {
        var page = this.pages[id];
        if (page)
            page.show.apply(page, data);
    },
    add: function(page) {
        this.pages[page.id] = page;
    },
    init: function() {
        for (var page in this.pages) {
            this.pages[page].init();
        }
    }
};

pages.add({
    id: 'settings',
    init: function() {
        dump("initialize "+this.id+"\n");
        $("#saveSettings").click(function(evt) {
            try {
                dump("save account settings\n");
                var account = accounts.current;
                $.extend(account, {
                    fullname: $('#settings input#fullname').val(),
                    email: $('#settings input#email').val(),
                    username: $('#settings input#username').val(),
                    password: ''
                });
                var pw1 = $('#settings input#password').val();
                var pw2 = $('#settings input#password2').val();
                if (pw1 === pw2) {
                    account['password'] = pw1;
                    alert("login stored");
                } else {
                    alert("passwords do not match");
                }
                accounts.save();
            } catch(e) {
                dump("error: "+e+"\n");
            }
        });
        $("#discardSettings").click(function(evt) {
            accounts.clear();
            $('#settings input#fullname').val("");
            $('#settings input#email').val("");
            $('#settings input#username').val("");
            $('#settings input#password').val("");
            $('#settings input#password2').val("");
            alert("login cleared");
        });
    },
    show: function() {
        var account = accounts.current;
        $('#settings input#fullname').val(account.fullname);
        $('#settings input#email').val(account.email);
        $('#settings input#username').val(account.username);
    }
});

pages.add({
    id: 'labels',
    init: function() {
        // we'll refresh the labels if an account is setup
        if (accounts.current)
            this.show();

        var self = this;
        $('#labels button.refresh').click(function(e) {
            self.show(true);
        });
    },
    show: function(refresh) {
        var self = this;
        mail.labels(refresh, function(labels) {
            self.updateLabels(labels);
        });
    },
    
    updateLabels: function(labels) {
        //dump("updateLabels: "+JSON.stringify(labels)+"\n");
        $("#folderList").empty();
        $.each(labels, function(i) {
           var m = /^\{.+\}(.*)$/.exec(labels[i]);
           if (m) {
            $("#tmplBoxList")
                .tmpl( {'id': m[1],'name': m[1]} )
                .appendTo("#folderList");  
           }
        });
        $("#folderList li").click(function(e) {
            location.hash = "messages/" + $(this).attr('id');
        });
    }
});

pages.add({
    id: 'messages',
    init: function() {
        var self = this;
        $('#messages button.refresh').click(function(e) {
            self.show($('#folderName').text(), true);
        });
    },
    show: function(label, refresh) {
        if (typeof(label) === 'undefined')
            label = $("#folderList li:first-child").attr('id');
        $('#msgList').empty();
        $('#folderName').text(label);

        var self = this;
        mail.messages(label, refresh, function(messages) {
            self.updateMessages(messages);
        });
    },

    updateMessages: function(messages) {
        var e = messages;
        $.each(e, function(i) {
            //dump(JSON.stringify(e[i])+"\n\n");
            var msg = e[i];
            msg.date = $.prettyDate.format(msg.date);
            //dump("date is "+JSON.stringify(e[i])+"\n");
            $("#tmplHeaderList")
                .tmpl( msg )
                .appendTo("#msgList");  
        });
        $(".messagePrev").click(function(e) {
            $(this).toggleClass("selected");
            $(this).siblings().removeClass('selected');

            location.hash = '#message/'+$(this).attr('id').trim();
        });
    }
});

pages.add({
    id: 'message',
    init: function() {
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
    },
    show: function(id) {
        //alert(id);
        $('#messageContent').empty();
        //$(".messagePrev.active").toggleClass("selected");
        $('page.secondary').removeClass('selected');
        $('body').addClass('secondary');
        $('#conversation').addClass('selected');

        var self = this;
        mail.message(id, function(msg) {
            self.showMessage(msg);
        });
    },
    
    showMessage: function(msg) {
        //dump("showMessage:  "+JSON.stringify(msg)+"\n\n");
        $("#tmplMessage")
            .tmpl( msg )
            .appendTo("#messageContent");
        if (msg.type === "HTML")
            $('#bodyFrame').ready(function() {
                $('#bodyFrame').contents().find('html').html(msg.body);
            });
        
    }
});


