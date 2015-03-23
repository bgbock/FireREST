var should = require("should"),
    module = module || {},
    firepick = firepick || {};
Logger = require("./Logger");

(function(firepick) {
    function Bernstein(n,options) {
		var that = this;
		options = options || {};
		should.exist(n);
		n.should.be.above(0);
		that.n = n;
		that.n2 = Math.ceil(n/2);
		that.logger = options.logger || new Logger(options);
		return that;
    };

    ///////////////// INSTANCE ///////////////
	Bernstein.prototype.coefficient = function(k,t) {
		var that = this;
		k.should.not.be.below(0);
		k.should.not.be.above(that.n);
		var result = Util.choose(that.n,k);
		var t1 = (1-t);
		for (var i = 1; i < that.n-k; i++) {
			result = result*t1;
		}
		for (var i = 1; i < k; i++) {
			result = result*t;
		}
		return result;
	};

	///////////////// CLASS //////////
	Bernstein.coefficient = function(n,k,t) {
		var result = Util.choose(n,k);
		result.should.not.NaN;
		var t1 = (1-t);
		for (var i = 1; i < n-k; i++) {
			result = result*t1;
		}
		result.should.not.NaN;
		for (var i = 1; i < k; i++) {
			result = result*t;
		}
		result.should.not.NaN;
		return result;
	};

    Logger.logger.info("loaded firepick.Bernstein");
    module.exports = firepick.Bernstein = Bernstein;
})(firepick || (firepick = {}));


(typeof describe === 'function') && describe("firepick.Bernstein", function() {
	var Bernstein = firepick.Bernstein;
	it("new Bernstein(5) should create a 5-degree Bernstein instance", function() {
		var b5 = new Bernstein(5);
		b5.should.have.properties({n:5,n2:3});
	});
	it("coefficient(k,t) should return Bernstein coefficient", function() {
		var b5 = new Bernstein(5);
		b5.coefficient(5,0).should.equal(0);
		b5.coefficient(5,0.5).should.equal(0.0625);
		b5.coefficient(5,1).should.equal(1);
		b5.coefficient(0,0).should.equal(1);
		b5.coefficient(0,0.5).should.equal(0.0625);
		b5.coefficient(0,1).should.equal(0);
		b5.coefficient(1,0).should.equal(5);
		b5.coefficient(1,0.5).should.equal(0.625);
		b5.coefficient(1,1).should.equal(0);
		b5.coefficient(2,0).should.equal(0);
		b5.coefficient(2,0.5).should.equal(1.25);
		b5.coefficient(2,1).should.equal(0);
		b5.coefficient(3,0).should.equal(0);
		b5.coefficient(3,0.5).should.equal(1.25);
		b5.coefficient(3,1).should.equal(0);
		b5.coefficient(4,0).should.equal(0);
		b5.coefficient(4,0.5).should.equal(0.625);
		b5.coefficient(4,1).should.equal(5);
	});
	it("Bernstein.coefficient(n,k,t) should return Bernstein coefficient", function() {
		Bernstein.coefficient(5,5,0).should.equal(0);
		Bernstein.coefficient(5,5,0.5).should.equal(0.0625);
		Bernstein.coefficient(5,5,1).should.equal(1);
		Bernstein.coefficient(5,0,0).should.equal(1);
		Bernstein.coefficient(5,0,0.5).should.equal(0.0625);
		Bernstein.coefficient(5,0,1).should.equal(0);
		Bernstein.coefficient(5,1,0).should.equal(5);
		Bernstein.coefficient(5,1,0.5).should.equal(0.625);
		Bernstein.coefficient(5,1,1).should.equal(0);
		Bernstein.coefficient(5,2,0).should.equal(0);
		Bernstein.coefficient(5,2,0.5).should.equal(1.25);
		Bernstein.coefficient(5,2,1).should.equal(0);
		Bernstein.coefficient(5,3,0).should.equal(0);
		Bernstein.coefficient(5,3,0.5).should.equal(1.25);
		Bernstein.coefficient(5,3,1).should.equal(0);
		Bernstein.coefficient(5,4,0).should.equal(0);
		Bernstein.coefficient(5,4,0.5).should.equal(0.625);
		Bernstein.coefficient(5,4,1).should.equal(5);
	});
})
