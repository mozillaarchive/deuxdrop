
/**
 * Lightly modified version of promise.js that adds support for debug meta-info
 *  generation.
 **/

// Debug meta-info changes by Andrew Sutherland <asutherland@asutherland.org>

// Tyler Close
// Ported and revised by Kris Kowal
//
// This API varies from Tyler Closes ref_send in the
// following ways:
//
// * Promises can be resolved to function values.
// * Promises can be resolved to null or undefined.
// * Promises are distinguishable from arbitrary functions.
// * The promise API is abstracted with a Promise constructor
//   that accepts a descriptor that receives all of the
//   messages forwarded to that promise and handles the
//   common patterns for message receivers.  The promise
//   constructor also takes optional fallback and valueOf
//   methods which handle the cases for missing handlers on
//   the descriptor (rejection by default) and the valueOf
//   call (which returns the promise itself by default)
// * near(ref) has been changed to Promise.valueOf() in
//   keeping with JavaScript's existing Object.valueOf().
// * post(promise, name, args) has been altered to a variadic
//   post(promise, name ...args)
// * variadic arguments are used internally where
//   applicable. However, I have not altered the Q.post()
//   API to expand variadic arguments since Tyler Close
//   informed the CommonJS list that it would restrict
//   usage patterns for web_send, posting arbitrary JSON
//   objects as the "arguments" over HTTP.

/*
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 *
 * ref_send.js version: 2009-05-11
 */

/*
 * Copyright 2009-2010 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 */

/*whatsupdoc*/

// - the enclosure ensures that this module will function properly both as a
// CommonJS module and as a script in the browser.  In CommonJS, this module
// exports the "Q" API.  In the browser, this script creates a "Q" object in
// global scope.
// - the use of "undefined" on the enclosure is a micro-optmization for
// compression systems, permitting every occurrence of the "undefined" keyword
// bo be replaced with a single-character.

define(
  [
    "exports"
  ],
  function (
    exports
  ) {

function enqueue(task) {
  setTimeout(task, 0);
};

/**
 * @typedef[EmitFunc @func[
 *   @args[
 *     @param["op"]
 *     @rest["arguments"]
 *   ]
 * ]]{
 *   A synchronous function call to invoke a method on the promise/object when
 *   it is resolved.  For deferred promises, the invocation is always forwarded
 *   to a future cycle of the event loop to ensure consistent/sane ordering and
 *   avoid triggering user logic callbacks when still in the process of
 *   registering them.  For wrapped/immediate promises, the operation on the
 *   descriptor is invoked directly; if a resolve function is supplied, it is
 *   invoked, which is in turn expected to forward all of its invocations to
 *   future event loop cycles.
 * }
 *
 **/

// ES5 shims
var freeze = Object.freeze || identity;
var create = Object.create || function create(prototype) {
    var Type = function () {};
    Type.prototype = prototype;
    return new Type();
};

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
exports.enqueue = enqueue;

var oneUpPromiseId = 1;

/**
 * Constructs a {promise, resolve} object.
 *
 * The resolver is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke the resolver with any value that is
 * not a function. To reject the promise, invoke the resolver with a rejection
 * object. To put the promise in the same state as another promise, invoke the
 * resolver with that other promise.
 */
exports.defer = defer;

function defer(what, whatSpecifically, promiseDeps) {
    // if "pending" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the pending array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the ref promise because it handles both fully
    // resolved values and other promises gracefully.
    var pending = [], value;

    var promise = Object.create(Promise.prototype);
    promise.emit = function () {
        var args = Array.prototype.slice.call(arguments);
        if (pending) {
            pending.push(args);
        } else {
            forward.apply(undefined, [value].concat(args));
        }
    };
    promise.id = oneUpPromiseId++;
    promise.what = what;
    promise.whatSpecifically = whatSpecifically;
    promise.createdAt = Date.now();
    promise.resolvedAt = null;
    if (promiseDeps)
      promise.promiseDeps = promiseDeps;

    promise.valueOf = function () {
        if (pending)
            return promise;
        return value.valueOf();
    };

    var resolve = function (resolvedValue) {
        var i, ii, task;
        if (!pending)
            return;
        promise.resolvedAt = Date.now();
        value = ref(resolvedValue, "resolve:" + what);
        // re-target all the emit requests we received previously to the new
        //  value we received.
        for (i = 0, ii = pending.length; i < ii; ++i) {
            forward.apply(undefined, [value].concat(pending[i]));
        }
        pending = undefined;
    };

    return {
        "promise": promise,
        "resolve": resolve,
        "reject": function (reason) {
            resolve(reject(reason));
        }
    };
}

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * put(name, value), post(name, args), delete(name), and valueOf(), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
exports.Promise = Promise;

function Promise(descriptor, fallback, valueOf) {

    if (fallback === undefined) {
        fallback = function (op) {
            return reject("Promise does not support operation: " + op);
        };
    }

    var promise = Object.create(Promise.prototype);

    // Invoke the descriptor method or fallback, then pass that to the
    //  `resolved` function.
    promise.emit = function (op, resolved /* ...args */) {
        var args = Array.prototype.slice.call(arguments, 2);
        var result;
        if (descriptor[op])
            result = descriptor[op].apply(descriptor, args);
        else
            result = fallback.apply(descriptor, arguments);
        if (resolved)
            return resolved(result);
        return result;
    };
    promise.id = oneUpPromiseId++;
    promise.what = undefined;;
    promise.whatSpecifically = undefined;

    if (valueOf)
        promise.valueOf = valueOf;

    return promise;
};

Promise.prototype.toSource = function () {
    return this.toString();
};

Promise.prototype.toString = function () {
    return '[object Promise]';
};

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a resolved value.
 */
exports.isPromise = isPromise;
function isPromise(object) {
    return object instanceof Promise;
};

/**
 * Return if the promise is actually a deferred's promise rather than a ref()ed
 *  value promise.
 */
function isDeferredPromise(object) {
  if (object === undefined || object === null)
    return false;
  return typeof(object) === "object" && ("createdAt" in object);
}
exports.isDeferredPromise = isDeferredPromise;

/**
 * @returns whether the given object is a fully
 * resolved value.
 */
exports.isResolved = isResolved;
function isResolved(object) {
    if (object === undefined || object === null)
        return true;
    return !isRejected(object) && !isPromise(object.valueOf());
};

/**
 * @returns whether the given object is a
 * rejected promise.
 */
exports.isRejected = isRejected;
function isRejected(object) {
    if (object === undefined || object === null)
        return false;
    return object.valueOf() instanceof reject;
}

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
exports.reject = reject;
function reject(reason) {
    var promise = Promise({
        "when": function (rejected) {
            return rejected ? rejected(reason) : reject(reason);
        }
    }, function fallback(op, resolved) {
        resolved = resolved || identity;
        return resolved(reject(reason));
    }, function valueOf() {
        var rejection = create(reject.prototype);
        rejection.reason = reason;
        return rejection;
    });
    promise.what = "rejection";
    return promise;
}

reject.prototype = create(Promise.prototype);
reject.prototype.constructor = reject;

/**
 * Constructs a promise for an immediate reference.
 * @param value immediate reference
 */
exports.ref = ref;

function ref(object, why) {
    // If the object is already a Promise, return it directly.  This enables
    // the ref function to both be used to created references from
    // objects, but to tolerably coerce non-promises to refs if they are
    // not already Promises.
    if (isPromise(object))
        return object;

    var wrapped = Promise({
        "when": function (rejected) {
            return object;
        },
        "get": function (name) {
            return object[name];
        },
        "put": function (name, value) {
            object[name] = value;
        },
        "delete": function (name) {
            delete object[name];
        },
        "post": function (name /*...args*/) {
            var args = Array.prototype.slice.call(arguments, 1);
            return object[name].apply(object, args);
        }
    }, undefined, function vaueOf() {
        return object;
    });
    wrapped.what = "wrapped:" + why;
    return wrapped;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the 'isDef' message
 * without a rejection.
 */
exports.def = def;
function def(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, resolved) {
        var args = Array.prototype.slice.call(arguments, 2);
        var result = send.apply(undefined, [object, op].concat(args));
        resolved = resolved || identity;
        return resolved(result);
    }, function valueOf() {
        return object.valueOf();
    });
}

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that resolved and rejected will be called only once.
 * 2. that either the resolved callback or the rejected callback will be
 *    called, but not both.
 * 3. that resolved and rejected will not be called in this turn.
 *
 * @param value     promise or immediate reference to observe
 * @param resolve function to be called with the resolved value
 * @param rejected  function to be called with the rejection reason
 * @return promise for the return value from the invoked callback
 */
exports.when = function (value, resolved, rejected, what, whatSpecifically) {
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    if (!what) {
      if (resolved && typeof(resolved) === "function" && resolved.name)
        what = "auto:" + resolved.name;
    }

    // Wrap the value in a promise if it is not already a promise.
    var promisedValue = ref(value, "when");
    var deferred = defer(what, whatSpecifically, [promisedValue]);

    // Invoke "when" on promisedValue (in a subsequent cycle).  The magic reason
    // for doing this is that:
    //
    // - If promisedValue is a deferred promise, then it will hold these
    //  arguments in suspended animation until the promise completes.  When the
    //  promise is resolved, we are provided a value, and our arguments below
    //  will be targeted to the provided value.  If that value is itself a
    //  promise, the cycle continues until a wrapped value promise is
    //  encountered.
    //
    // - If promisedValue is a value promise (via "ref"), then its emit method
    //  will be invoked synchronously.  For the 'when' case, this will result
    //  in it simply returning the raw underlying value.  The emit function
    //  will then invoke the 'resolved' function we are passing in...
    forward(promisedValue, "when", function (value) {
        // (we are here inside our resolved function because the promisedValue
        //  eventually bottomed out in a wrapped value, and that (raw) value is
        //  being passed to us now.) =>
        // value **MUST BE** a ref()ed value at this point!
        if (done)
            return;
        done = true;

        // sanity-check explode per the above.
        if (isPromise(value))
          throw new Error("value is a promise and that is impossible");

        // You will note that at this point we have not yet called the resolved
        //  function that the original caller to "when" passed in.  We do that
        //  now...
        // All that ref(value) doing is providing a means for us to invoke
        //  Promise.emit() and use its logic.  (At least until remoting
        //  capabilities enter the picture.)  This logic is synchronous
        //  and *will* return the actual value of calling resolved.
        var retVal = ref(value).emit("when", resolved, rejected);

        // If the resolved function returned a deferred promise, anything that
        //  is "when"-ing on our deferred will be retargeted to the new promise.
        //  For dependency purposes, this means our promise is now dependent
        //  on that new promise instead of the promise we originally depended
        //  on.
        if (isDeferredPromise(retVal)) {
          // Put a sentinel value in to precede this promise to convey that we
          //  "bounced" to it.  This allows the visualization to visually
          //  differentiate between parallel and serial "bounces".  We also
          //  could try and re-structure things to form a serial chain, but
          //  that could lead to information loss in the event that two promises
          //  "bounce" to the same result promise...
          deferred.promise.promiseDeps.push("bounce");
          deferred.promise.promiseDeps.push(retVal);
        }

        // We then pass the return value of the resolved method to our
        //  deferred's resolve method (will will in turn "ref" it).
        deferred.resolve(retVal);
    }, function (reason) {
        if (done)
            return;
        done = true;
        deferred.resolve(rejected ? rejected(reason) : reject(reason));
    });
    return deferred.promise;
};

/**
 * Like "when", but attempts to return a fully resolved
 * value in the same turn. If the given value is fully
 * resolved, and the value returned by the resolved
 * callback is fully resolved, asap returns the latter
 * value in the same turn. Otherwise, it returns a promise
 * that will be resolved in a future turn.
 *
 * This method is an experiment in providing an API
 * that can unify synchronous and asynchronous API's.
 * An API that uses "asap" guarantees that, if it
 * is provided fully resolved values, it would produce
 * fully resolved values, but if it is provided
 * asynchronous promises, it will produce asynchronous
 * promises.
 *
 * /!\ WARNING: this method is experimental and likely
 * to be removed on the grounds that it probably
 * will result in composition hazards.
 */
exports.asap = function (value, resolved, rejected) {
    resolved = resolved || identity;
    if (isResolved(value))
        return resolved(value.valueOf()).valueOf();
    else
        return when(value, resolved, rejected);
};

/**
 * Constructs a promise method that can be used to safely observe resolution of
 * a promise for an arbitrarily named method like "propfind" in a future turn.
 *
 * "Method" constructs methods like "get(promise, name)" and "put(promise)".
 */
exports.Method = Method;
function Method (op) {
    return function (object) {
        var args = Array.prototype.slice.call(arguments, 1);
        return send.apply(undefined, [object, op].concat(args));
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param ...args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
exports.send = send;
function send(object, op) {
    var deferred = defer();
    var args = Array.prototype.slice.call(arguments, 2);
    forward.apply(undefined, [
        ref(object),
        op,
        deferred.resolve
    ].concat(args));
    return deferred.promise;
}

/**
 * Wrap an existing promise in a new promise exclusively for the debugging
 *  benefits; there are no functional benefits from this.
 */
exports.wrap = function (promise, what, whatSpecifically) {
  var deferred = defer(what, whatSpecifically, [promise]);
  // we could probably optimize the extra enqueue-ings out of existence...
  exports.when(promise, deferred.resolve, deferred.reject);
  return deferred.promise;
};

/**
 * Create a new promise that is resolved when all of the promises in the list of
 *  provided promises are resolved.  Most notably exposes debugging information
 *  that tracks all of the promises as parallel operations.
 */
exports.all = function (promises, resolutionValue, what, whatSpecifically) {
  var deferred = exports.defer(what, whatSpecifically, promises.concat());
  var expectedCount = 0, triggeredCount = 0, rejectedCount = 0;
  function depPromiseFulfilled() {
    triggeredCount++;
    if (triggeredCount === expectedCount) {
      if (rejectedCount)
        deferred.reject(resolutionValue);
      else
        deferred.resolve(resolutionValue);
    }
  }
  function depPromiseRejected() {
    triggeredCount++;
    rejectedCount++;
    if (triggeredCount === expectedCount) {
      deferred.reject(resolutionValue);
    }
  }
  for (var i = 0; i < promises.length; i++) {
    expectedCount++;
    forward(promises[i], "when", depPromiseFulfilled, depPromiseRejected);
  }
  return deferred.promise;
};

/**
 * Like "all", but allows promises to be added dynamically until the group is
 *  locked.
 */
exports.joinableGroup = function (what, whatSpecifically) {
  var promiseDeps = [];
  var deferred = exports.defer(what, whatSpecifically, promiseDeps);
  // Start expectedCount at 1 so if one thing gets added and fires before we
  //  lock we don't prematurely fire.
  var expectedCount = 1, triggeredCount = 0, rejectedCount = 0;
  var locked = false;
  function depPromiseFulfilled() {
    triggeredCount++;
    if (triggeredCount === expectedCount) {
      if (rejectedCount)
        deferred.reject();
      else
        deferred.resolve();
    }
  }
  function depPromiseRejected() {
    triggeredCount++;
    rejectedCount++;
    if (triggeredCount === expectedCount) {
      deferred.reject();
    }
  }
  return {
    join: function(promise) {
      if (locked)
        throw new Error("no adding promises to a locked group");
      if (isPromise(promise)) {
        expectedCount++;
        exports.when(promise, depPromiseFulfilled);
        promiseDeps.push(promise);
      }
    },
    promise: deferred.promise,
    lock: function() {
      if (locked)
        return;
      locked = true;
      // drop the expected count so it can match with the trigger count
      expectedCount--;
      // as may already be the case
      if (expectedCount === triggeredCount)
        deferred.resolve();
    },
  };
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
exports.get = Method("get");

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
exports.put = Method("put");

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
exports.del = Method("del");

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param argv      array of invocation arguments
 * @return promise for the return value
 */
exports.post = Method("post");

/**
 * Guarantees that the give promise resolves to a defined, non-null value.
 */
exports.defined = function (value) {
    return exports.when(value, function (value) {
        if (value === undefined || value === null)
            return reject("Resolved undefined value: " + value);
        return value;
    });
};

/**
 * Throws an error with the given reason.
 */
exports.error = function (reason) {
    if (!(reason instanceof Error))
        reason = new Error(reason);
    throw reason;
};

/*
 * Enqueues a promise operation for a future turn.
 *
 * Eats the first argument, a promise, and enqueues the remaining arguments as
 *  arguments to a call to promise.emit on a subsequent turn.
 */
function forward(promise /*, op, resolved, ... */) {
    var args = Array.prototype.slice.call(arguments, 1);
    enqueue(function () {
        promise.emit.apply(promise, args);
    });
}

}); // end define
