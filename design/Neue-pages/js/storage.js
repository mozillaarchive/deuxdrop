
// localStorage is currently used to store retrieved data.  The
// accounts interface is used to store data on a per-account basis, allowing
// for multiple accounts to be used.

var storage = {
    get: function(name, _default) {
        var val = localStorage[name];
        if (!val) {
            localStorage[name] = _default;
            return _default;
        }
        try {
            return JSON.parse(val);
        } catch(e) {}
        return _default;
    },
    
    set: function(name, val) {
        localStorage[name] = JSON.stringify(val);
    },
    
    remove: function(name) {
        delete localStorage[name];
    }
}


var accounts = {
    account: null,
    get current() {
        if (!this.account) {
            try {
                return this.open();
            } catch(e) {
                dump("failed to get an account "+e+"\n");
                this.account = {};
            }
        }
        dump("current account: "+this.account.email+"\n");
        return this.account;
    },
    open: function(id) {
        if (!id) {
            id = storage.get('currentAccount', null);
            if (!id)
                throw new Error('no account selected');
        }
        dump("getting account: "+id+"\n");
        this.account = storage.get(id, {});
        storage.set('currentAccount', id);
        return this.account;
    },
    save: function() {
        dump("saving account: "+this.account.email+"\n");
        storage.set(this.account.email, this.account);
        storage.set('currentAccount', this.account.email);
    },
    clear: function() {
        if (this.account) {
            storage.remove(this.account.email);
        }
        storage.set('currentAccount', null);
        this.account = null;
    },
    get: function(name, _default) {
        var id = this.account.email+":"+name;
        return storage.get(id, _default);
    },
    
    set: function(name, val) {
        var id = this.account.email+":"+name;
        storage.set(id, val);
    }
}

