define(function (require) {
  // hackish hookup to MAGIC_ERROR_TRAPPER for unit testing; this also has the
  //  nice side-effect of cutting down on RequireJS errors at startup when
  //  Q is loading.
  return {
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
  };
});
