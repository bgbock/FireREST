var should = require("should"),
    module = module || {},
    firepick = firepick || {};
Logger = require("./Logger");
Bernstein = require("./Bernstein");
Tridiagonal = require("./Tridiagonal");
PHFactory = require("./PHFactory");
PH5Curve = require("./PH5Curve");
PHFeed = require("./PHFeed");


(function(firepick) {
	var logger;

    function PnPPath(pt1,pt2,options) {
		var that = this;

		pt1.should.have.properties(['x','y','z']);
		pt2.should.have.properties(['x','y','z']);
		that.pt1 = pt1;
		that.pt2 = pt2;

		options = options || {};
		logger = options.logger || logger || new Logger(options);
		that.hCruise = options.hCruise == null ? 20 : options.hCruise;
		that.tauTakeoff = options.tauTakeoff == null ? 0.1 : options.tauTakeoff;
		that.tauLanding = options.tauLanding == null ? 0.9 : options.tauLanding;
		var homeLocus = options.homeLocus ? options.homeLocus : {};
		that.homeLocus = {
			x:homeLocus.x == null ? 0 : homeLocus.x,
			y:homeLocus.y == null ? 0 : homeLocus.y,
			r:homeLocus.r == null ? 70 : homeLocus.r,
		};

		that.tauTakeoff.should.within(0,0.5);
		that.tauLanding.should.within(0.5,1);

		that.apogee = PnPPath.calcApogee(that.pt1, that.pt2, that.homeLocus, that.hCruise);
		that.tauCruise = (that.tauLanding-that.tauTakeoff);
		logger.debug("calculating PH5Curve for z");
		var scale=10;
		var dz = scale*Math.abs(pt2.z-pt1.z);
		that.phz = new PHFactory([
			{x: that.pt1.z,y:0},
			{x: that.apogee.z,y:0.5*dz},
			{x: that.pt2.z,y:dz},
		]).quintic();
		logger.debug("calculating PH5Curve for x,y");
		that.phxy = new PHFactory([
			{x: that.pt1.x,y:that.pt1.y},
			{x: that.apogee.x, y:that.apogee.y},
			{x: that.pt2.x,y:that.pt2.y},
		]).quintic();

		return that;
    };

	///////////////// INSTANCE API ///////////////
	PnPPath.prototype.position = function(tau) {
		var that = this;
		var x = that.pt1.x;
		var y = that.pt1.y;
		var z = that.pt1.z;
		if (tau <= that.tauTakeoff) {
			return {x: that.pt1.x, y: that.pt1.y, z:that.phz.r(tau).re};
		}
		if (tau >= that.tauLanding) {
			return {
				x: that.pt2.x, 
				y: that.pt2.y, 
				z: tau >= 1 ? that.pt2.z : that.phz.r(tau).re
			};
		}

		// the XY PH5Curve spans tauTakeoff, not tau
		var tauxy = (tau-that.tauTakeoff) / that.tauCruise;
		var xy = that.phxy.r(tauxy);

		return {x:xy.re,y:xy.im,z:that.phz.r(tau).re};
	};

	///////////////// CLASS //////////
	PnPPath.setLogger = function(value) {
		should(value.info)
		logger = value;
	}
	PnPPath.cardinalDirection = function(pt, homeLocus) {
		var dx = pt.x - homeLocus.x;
		var dy = pt.y - homeLocus.y;
		if (Math.abs(dx) > Math.abs(dy)) {
			return dx >= 0 ? 1 : 3; // east, west
		} else {
			return dy >= 0 ? 0 : 2; // north, south
		}
	}
	PnPPath.calcApogee = function(pt1, pt2, homeLocus, hCruise) {
		var apogee = {
			x:(pt1.x+pt2.x)/2,
			y:(pt1.y+pt2.y)/2,
			z:Math.max(pt1.z,pt2.z)+hCruise,
		};
		var d = PnPPath.ftlDistance(pt1, pt2, homeLocus);
		var cd1 = PnPPath.cardinalDirection(pt1, homeLocus);
		var cd2 = PnPPath.cardinalDirection(pt2, homeLocus);
		if (d > homeLocus.r && cd1 != cd2) {
			var dx = apogee.x - homeLocus.x;
			var dy = apogee.y - homeLocus.y;
			var scale = homeLocus.r / Math.sqrt(dx*dx + dy*dy);
			apogee.x = homeLocus.x + dx*scale;
			apogee.y = homeLocus.y + dy*scale;
		}

		logger.debug("apogee:", apogee);
		return apogee;
	}
	PnPPath.ftlDistance = function(pt1, pt2, homeLocus) {
		var dx = pt2.x - pt1.x;
		var dy = pt2.y - pt1.y;
		var numerator = Math.abs(
			dy*homeLocus.x 
			- dx*homeLocus.y 
			+ pt2.x*pt1.y 
			- pt2.y*pt1.x);
		var denominator = Math.sqrt(dy*dy + dx*dx);
		return numerator/denominator;
	}


    Logger.logger.info("loaded firepick.PnPPath");
    module.exports = firepick.PnPPath = PnPPath;
})(firepick || (firepick = {}));


(typeof describe === 'function') && describe("firepick.PnPPath", function() {
	var logger = new Logger({
		nPlaces:1,
		logLevel:"debug"
	});
	var PnPPath = firepick.PnPPath;
	var epsilon = 0.000001;
	var pt1 = {x:10, y:20, z:-50};
	var pt2 = {x:-90, y:21, z:-60};
	var e = 0.000001;

	function shouldPositionT(actual, expected) {
		if (expected.x != null) {
			actual.x.should.within(expected.x-e, expected.x+e, "x actual:"+actual.x+" expected:"+expected.x);
		}
		if (expected.y != null) {
			actual.y.should.within(expected.y-e, expected.y+e, "y actual:"+actual.y+" expected:"+expected.y);
		}
		if (expected.z != null) {
			actual.z.should.within(expected.z-e, expected.z+e, "z actual:"+actual.z+" expected:"+expected.z);
		}
	}
	it("position(0) should return first point", function() {
		var pnp = new PnPPath(pt1, pt2, {});

		pnp.position(0).should.have.properties({
			x:pt1.x,
			y:pt1.y,
			z:pt1.z
		});
	});
	it("TESTTESTposition(1) should return last point", function() {
		var pnp = new PnPPath(pt1, pt2, {});

		pnp.position(1).should.have.properties({
			x:pt2.x,
			y:pt2.y,
			z:pt2.z
		});
	});
	it('TESTTESTshould have option for setting takeoff tau', function() {
		new PnPPath(pt1,pt2,{}).should.have.properties({
			tauTakeoff:0.1,
		});
		new PnPPath(pt1,pt2,{tauTakeoff:0.2}).should.have.properties({
			tauTakeoff:0.2,
		});
	});
	it('TESTTESTshould have option for setting landing tau', function() {
		new PnPPath(pt1,pt2,{}).should.have.properties({
			tauLanding:0.9,
		});
		new PnPPath(pt1,pt2,{tauLanding:0.8}).should.have.properties({
			tauLanding:0.8,
		});
	});
	it('TESTTESTshould have option for cruise height', function() {
		new PnPPath(pt1,pt2,{}).should.have.properties({
			hCruise:20,
		});
		new PnPPath(pt1,pt2,{hCruise:50}).should.have.properties({
			hCruise:50,
		});
	});
	it('TESTTESTshould have option for unrestricted travel locus', function() {
		new PnPPath(pt1,pt2,{}).should.have.properties({
			homeLocus:{x:0,y:0,r:70},
		});
		new PnPPath(pt1,pt2,{homeLocus:{r:30}}).should.have.properties({
			homeLocus:{x:0,y:0,r:30},
		});
	});
	it('TESTTESTshould have property giving highest point of path', function() {
		new PnPPath(pt1,pt2,{}).should.have.properties({
			apogee:{x:-40, y:20.5, z:-30}
		});
	});
	it('TESTTESTposition(0.5) should be the apogee', function() {
		var pnp = new PnPPath(pt1,pt2,{});
		shouldPositionT(pnp.position(0.5), {x:-40, y:20.5, z:-30});
	});
	it('TESTTESTposition(0.1) should be directly above pt1', function() {
		var pnp = new PnPPath(pt1,pt2);
		var pos = pnp.position(0.1);
		shouldPositionT(pos, {x:pt1.x, y:pt1.y});
		pos.z.should.be.above(pt1.z);
	});
	it('TESTTESTposition(0.9) should be directly above pt2', function() {
		var pnp = new PnPPath(pt1,pt2,{});
		var pos = pnp.position(0.9);
		shouldPositionT(pos, {x:pt2.x, y:pt2.y});
		pos.z.should.be.above(pt1.z);
	});
	it('TESTTESTcardinalDirection(pt,homeLocus) should give cardinal point as 0,1,2,3 for N,E,S,W', function() {
		PnPPath.cardinalDirection({x:50,y:90},{x:0,y:0}).should.equal(0);
		PnPPath.cardinalDirection({x:100,y:90},{x:0,y:0}).should.equal(1);
		PnPPath.cardinalDirection({x:100,y:90},{x:100,y:100}).should.equal(2);
		PnPPath.cardinalDirection({x:100,y:90},{x:200,y:100}).should.equal(3);
	});
	it('TESTTESTftlDistance(pt1,pt2,homeLocus) should give distance to free travel locus', function() {
		var d = PnPPath.ftlDistance({x:0,y:10},{x:10,y:0},{x:0,y:0});
		should(d).within(7.071,7.072);
		d = PnPPath.ftlDistance({x:10,y:0},{x:0,y:10},{x:0,y:0});
		should(d).within(7.071,7.072);
		d = PnPPath.ftlDistance({x:10,y:0},{x:10,y:10},{x:0,y:0});
		should(d).equal(10); // horizontal line
		d = PnPPath.ftlDistance({x:10,y:0},{x:10,y:10},{x:0,y:0});
		should(d).equal(10); // vertical line
		d = PnPPath.ftlDistance({x:5,y:17},{x:15,y:7},{x:5,y:7});
		should(d).within(7.071,7.072);	// offset locus
	});
	it('TESTTESTapogee should be within home locus', function() {
		var pnp = new PnPPath({x:100,y:50,z:-30},{x:50,y:90,z:-40});
		var pos = pnp.position(0.5);
		var N = 20;
		for (var i=0; i<=N; i++) {
			var tau = i/N;
			logger.withPlaces(3).info("position(", tau, "):", pnp.position(tau));
		}
		shouldPositionT(pos, {x:51.173869,y:47.762278,z:-10});
		pos.z.should.be.above(pt1.z);
	});
})
