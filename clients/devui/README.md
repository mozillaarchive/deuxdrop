The dev UI has a few goals:

* Make it easier to develop by being able to have UI state that is inconsistent
   with the general UX goals or mobile UX goals.  For example, the mobile UI
   currently should only have one conversation query active at a time.  The
   development UI can have an unlimited number, making it easier to experiment
   and cause log traces to be generated for things that would otherwise require
   a unit test to be fashioned.

* Resemble a potential (non-touch-focused) desktop UI.  Many people prefer a
   traditional 3-pane mail client over the alternatives, and it is nice to show
   that we both a) have the capability and b) are not just waving our hands and
   claiming it can be done.  Having said that, the interface is biased towards
   the Thunderbird hometab experiments' planned UX because that lines up with
   our data model and is most helpful to development.

* Serve as an alternate UI with an alternate implementation idiom to make sure
   we don't specialize the moda API too much for our one real UI.
