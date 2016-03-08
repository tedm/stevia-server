function STVResponse(args) {
  this.apiVersion = "";
  this.warning = "";
  this.queryOptions = {};
  this.response = [];

  this._initialize(args);
}

STVResponse.prototype = {
  _initialize: function(args) {
    for (var arg in args) {
      this[arg] = args[arg];
    }
  }

};

module.exports = STVResponse;