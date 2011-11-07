Our goals in terms of testing the user interfaces are many:

* Have all test drivers implement the same API.
  * Have this API be the same as/a subset of our unit testing API.  This allows
    for reuse of tests and avoids mental confusion from having similar-looking
    APIs.  We can change the current unit testing API as needed.
* Use the Selenium WebDriver API (not transport layer) as our standard API for
   DOM manipulation.  No one wants another API for this stuff and it is well
   suited to generating a play-by-play of what the test is actually doing.
* Be able to automatically screenshot/DOMshot the result of manipulating the
   API so that:
  * We can have pretty, up-to-date screenshots to show off!
  * We can detect regressions by doing image diffs/DOM diffs reftest-style.
  * We can master said tests by inspecting the screenshots.
* Be able to track latency/speed from a user perspective to a first
   approximation.  We can use Eideticker/the like when we need that level of
   resolution.
* Integrate with our existing unit testing framework.  Which is to say, be
   explicitly asynchronous and stick with our testing framework's support for
   asynchronous tests rather than bringing something else into the picture.

