var should = require("should"),
    module = module || {},
    firepick = firepick || {};
Logger = require("./Logger");
Bernstein = require("./Bernstein");
PHFactory = require("./PHFactory");

(function(firepick) {
	var DEGREE = 5;
	var b4 = new Bernstein(4);
	var b5 = new Bernstein(5);
    function PH5Curve(phz,options) {
		var that = this;
		options = options || {};
		that.logger = options.logger || new Logger(options);
		for (var i=1; i<phz.length; i++) {
			that.logger.trace("phz[",i,"]:",phz[i]);
			phz[i].re.should.be.Number;
			phz[i].im.should.be.Number;
		}
		that.N = phz.length-1;
		that.z = phz;
		return that;
    };

	/////////////// PRIVATE ////////////////
	function powert(p,tk,t1k,K) {
		var p1 = 1 - p;
		tk.push(1);
		t1k.push(1);
		for (var k=1; k<=K; k++) {
			tk.push(p*tk[k-1]);
			t1k.splice(0, 0, p1*t1k[0]);
		}
	};

    ///////////////// INSTANCE ///////////////
	PH5Curve.prototype.s = function(p) { // arc length 
		var that = this;
		p.should.not.be.below(0);
		p.should.not.be.above(1);
		var PN = p * that.N;
		var i = Math.ceil(PN) || 1;
		var sum = 0;
		for (var iSeg=1; iSeg < i; iSeg++) {
			sum += that.sit(iSeg, 1);
		}
		sum += that.sit(i, PN-i+1);
		return sum;
	};
	PH5Curve.prototype.sit = function(i, p) { // arc length 
		var that = this;
		var sum = 0;
		for (var k=0; k <= DEGREE; k++) {
			var b5c = b5.coefficient(k, p);
			sum += that.sik(i,k) * b5c;
			that.logger.trace("sit k:", k, " sum:", sum, " b5c:", b5c, " p:", p);
		}
		return sum;
	};
	PH5Curve.prototype.sik = function(i, k) { // arc length 
		var that = this;
		var sum = 0;
		for (var j=0; j<=k-1; j++) {
			sum += that.sigmaij(i,j);
		}
		return sum/DEGREE;
	};
	PH5Curve.prototype.sigmaij = function(i,j) {
		var that = this;
		var wi0 = that.wij(i,0);
		var wi1 = that.wij(i,1);
		var wi2 = that.wij(i,2);
		var u0 = wi0.re;
		var v0 = wi0.im;
		var u1 = wi1.re;
		var v1 = wi1.im;
		var u2 = wi2.re;
		var v2 = wi2.im;
		switch(j) {
		case 0: return u0*u0 + v0*v0;
		case 1: return u0*u1 + v0*v1;
		case 2: return (2/3)*(u1*u1+v1*v1) + (1/3)*(u0*u2+v0*v2);
		case 3: return u1*u2 + v1*v2;
		case 4: return u2*u2 + v2*v2;
		default: should.fail("invalid j:" + j);
		}
	};
	PH5Curve.prototype.sigma = function(p) { // curve parametric speed
		var that = this;
		return that.rprime(p).modulus();
	};
	PH5Curve.prototype.rprime = function(p) { // hodograph
		var that = this;
		p.should.not.be.below(0);
		p.should.not.be.above(1);
		var PN = p * that.N;
		var i = Math.ceil(PN) || 1;
		return Complex.times(that.N,that.ritprime(i,PN-i+1));
	};
	PH5Curve.prototype.ritprime = function(i,p) { // segment hodograph
		var that = this;
		var sum = new Complex();
		var p1 = 1-p;
		var z = that.z;
		var N = that.N;
		if (i === 1) {
			var z1 = z[1];
			var z2 = z[2];
			sum.add(Complex.times(1/2*p1*p1, Complex.times(3,z1).minus(z2)));
			sum.add(Complex.times(2*p1*p, z1));
			sum.add(Complex.times(1/2*p*p, z1.plus(z2)));
		} else if (i === N) {
			var zN = z[N];
			var zN1 = z[N-1];
			sum.add(Complex.times(1/2*p1*p1, zN.plus(zN1)));
			sum.add(Complex.times(2*p1*p, zN));
			sum.add(Complex.times(1/2*p*p, Complex.times(3,zN).minus(zN1)));
		} else {
			sum.add(Complex.times(1/2*p1*p1, z[i-1].plus(z[i])));
			sum.add(Complex.times(2*p1*p, z[i]));
			sum.add(Complex.times(1/2*p*p, z[i].plus(z[i+1])));
		}
		return sum.times(sum);
	};
	PH5Curve.prototype.r = function(p) {
		var that = this;
		p.should.not.be.below(0);
		p.should.not.be.above(1);
		var PN = p * that.N;
		var i = Math.ceil(PN) || 1;
		return that.rit(i,PN-i+1);
	};
	PH5Curve.prototype.rit = function(i,p) {
		var that = this;
		i.should.not.be.below(0);
		i.should.not.be.above(that.N);
		p.should.not.be.below(0);
		p.should.not.be.above(1);
		that.logger.trace("rit(", i, ",", p, ")");
		var sum = new Complex();
		var tk = [];
		var t1k = [];
		powert(p,tk,t1k,5);
		for (var k=0; k<=5; k++) {
			var re = Util.choose(5,k) * t1k[k] * tk[k];
			var c = Complex.times(that.pik(i,k), re);
			sum.add(c);
			that.logger.trace("rit k:", k, " re:", re, " c:", c, " sum:", sum, 
				" pik:", that.pik(i,k), " choose:", Util.choose(5,k));
		}
		return sum;
	};
	PH5Curve.prototype.w1j = function(j) {
		var that = this;
		var z1 = that.z[1];
		var z2 = that.z[2];
		switch (j) {
		case 0:return Complex.times(1/2, Complex.times(3,z1).minus(z2));
		case 1:return z1;
		case 2:return Complex.times(1/2,z1.plus(z2));
		default: should.fail("w1j j:"+j);
		}
	};
	PH5Curve.prototype.wNj = function(j) {
		var that = this;
		var zN = that.z[that.N];
		var zN1 = that.z[that.N-1];
		switch(j) {
		case 0:return Complex.times(1/2,zN1.plus(zN));
		case 1:return zN;
		case 2:return Complex.times(1/2, Complex.times(3,zN).minus(zN1));
		default: should.fail("wNj j:"+j);
		}
	};
	PH5Curve.prototype.wij = function(i,j) {
		var that = this;
		if (i === 1) {
			return that.w1j(j);
		}
		if (i === that.N) {
			return that.wNj(j);
		}
		var zi = that.z[i];
		i.should.not.be.below(1);
		i.should.not.be.above(that.N);
		zi.should.instanceOf(Complex);
		that.z[i-1].should.instanceOf(Complex);
		switch (j) {
		case 0:return Complex.times(1/2,that.z[i-1].plus(zi));
		case 1:return zi;
		case 2:return Complex.times(1/2,zi.plus(that.z[i+1]));
		default: should.fail("wij j:"+j);
		}
	};
	PH5Curve.prototype.pik = function(i,k) {
		var that = this;
		i.should.be.above(0);
		i.should.not.be.above(that.N);

		switch (k) {
		case 0: return that.q[i-1];
		case 1: return that.pik(i,0)
			.plus(Complex.times(1/5,that.wij(i,0).times(that.wij(i,0))));
		case 2: return that.pik(i,1)
			.plus(Complex.times(1/5,that.wij(i,0).times(that.wij(i,1))));
		case 3: return that.pik(i,2)
			.plus(Complex.times(2/15,that.wij(i,1).times(that.wij(i,1))))
			.plus(Complex.times(1/15,that.wij(i,0).times(that.wij(i,2))));
		case 4: return that.pik(i,3)
			.plus(Complex.times(1/5,that.wij(i,1).times(that.wij(i,2))));
		case 5: return that.pik(i,4)
			.plus(Complex.times(1/5,that.wij(i,2).times(that.wij(i,2))));
		default: should.fail("invalid k:" + k);
		}
	};

	///////////////// CLASS //////////

    Logger.logger.info("loaded firepick.PH5Curve");
    module.exports = firepick.PH5Curve = PH5Curve;
})(firepick || (firepick = {}));


(typeof describe === 'function') && describe("firepick.PH5Curve", function() {
	var logger = new Logger({
		nPlaces:1,
		logLevel:"info"
	});
	var PH5Curve = firepick.PH5Curve;
	function shouldEqualT(c1,c2,epsilon) { 
		epsilon = epsilon || 0.001; 
		c1.should.instanceof(Complex);
		c2.should.instanceof(Complex);
		c1.isNear(c2, epsilon).should.equal(true, 
			"expected:" + c2.stringify({nPlaces:3}) +
			" actual:" + c1.stringify({nPlaces:3}));
	};
	it("s(p) should be monotone returning arc length for p:[0,1] ", function() {
		var ph = new PHFactory([
			{x:1,y:1},
			{x:5,y:4},
		],{logger:logger});
		should.exist(ph.solvez());
		var phi = new PH5Curve(ph.z);
		var epsilon = 0.0000000001;
		phi.s(0+epsilon).should.above(phi.s(0));
		phi.s(0.1+epsilon).should.above(phi.s(0.1));
		phi.s(0.2+epsilon).should.above(phi.s(0.2));
		phi.s(0.3+epsilon).should.above(phi.s(0.3));
		phi.s(0.4+epsilon).should.above(phi.s(0.4));
		phi.s(0.5+epsilon).should.above(phi.s(0.5));
		phi.s(0.6+epsilon).should.above(phi.s(0.6));
		phi.s(0.7+epsilon).should.above(phi.s(0.7));
		phi.s(0.8+epsilon).should.above(phi.s(0.8));
		phi.s(0.9+epsilon).should.above(phi.s(0.9));
		phi.s(1-epsilon).should.above(phi.s(1-2*epsilon));
		phi.s(0).should.equal(0);
		phi.s(0.1).should.within(0.499,0.500);
		phi.s(0.5).should.within(2.5,2.5);
		phi.s(0.9).should.within(4.499,4.500);
		phi.s(1).should.within(5,5);
	});
	it("rprime(p) should return velocity vector for p:[0,1]", function() {
		var ph = new PHFactory([
			{x:-1,y:1},
			{x:0,y:2},
			{x:1,y:1},
		],{logger:logger});
		should.exist(ph.solvez());
		var phi = new PH5Curve(ph.z);
		var epsilon = 0.001;
		shouldEqualT(phi.rprime(0), new Complex(0.945,4.000), epsilon);
		shouldEqualT(phi.rprime(0.25), new Complex(2.132,2.000), epsilon);
		shouldEqualT(phi.rprime(0.5), new Complex(2.528,0.000), epsilon);
		shouldEqualT(phi.rprime(0.75), new Complex(2.132,-2.000), epsilon);
		shouldEqualT(phi.rprime(1), new Complex(0.945,-4.000), epsilon);
	});
	it("sigma(p) should return parametric speed for p:[0,1]", function() {
		var ph = new PHFactory([
			{x:-1,y:1},
			{x:0,y:2},
			{x:1,y:1},
		],{logger:logger});
		ph.solvez();
		var phi = new PH5Curve(ph.z);
		var epsilon = 0.001;
		phi.sigma(0).should.within(4.110,4.111);
		phi.sigma(0.3).should.within(2.780,2.781);
		phi.sigma(0.5).should.within(2.527,2.528);
		phi.sigma(0.7).should.within(2.780,2.781);
		phi.sigma(1.0).should.within(4.110,4.111);
	});
})
