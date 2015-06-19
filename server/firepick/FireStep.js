var should = require("should"),
    module = module || {},
    firepick = firepick || {};
Logger = require("./Logger");
Bernstein = require("./Bernstein");
Tridiagonal = require("./Tridiagonal");
PHFactory = require("./PHFactory");
PH5Curve = require("./PH5Curve");
PHFeed = require("./PHFeed");
PnPPath = require("./PnPPath");
DeltaCalculator = require("./DeltaCalculator");
XYZPositioner = require("./XYZPositioner");

(function(firepick) {
	var logger = new Logger();
	var nullWriter = function(msg) {};
	var byteHex = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];

    function FireStep(options) {
		var that = this;

		options = options || {};
		that.delta = options.delta || new DeltaCalculator({
			steps360: options.steps360 == null ? 400 : options.steps360,
			microsteps: options.microsteps == null ? 16 : options.microsteps,
		});
		that.delta.should.instanceof(DeltaCalculator);
		that.write = options.write || nullWriter;
		that.position = options.position || {x:0,y:0,z:0};
		that.hCruise = options.hCruise == null ? 20 : options.hCruise;
		var revPulses = that.delta.steps360*that.delta.microsteps;
		that.vMax = options.vMax || 2*revPulses;
		that.vMax.should.above(0);
		that.tvMax = options.tvMax || 0.4;
		that.tvMax.should.above(0);

		return that;
    };

	///////////////// INSTANCE API ///////////////
	FireStep.prototype.health = function() {
		return 1;
	}
	FireStep.prototype.home = function() {
		var that = this;
		var cmd = {
			hom:{
				x:that.delta.homePulses.p1,
				y:that.delta.homePulses.p2,
				z:that.delta.homePulses.p3,
			}
		};
		that.write(JSON.stringify(cmd));
		that.write("\n");
		that.position = that.delta.calcXYZ(that.delta.homeAngles);
		return that;
	}
	FireStep.prototype.getXYZ = function() {
		var that = this;
		return that.position;
	}
	FireStep.prototype.move = function(xyz) {
		var that = this;
		if (xyz instanceof Array) {
			for (var i=0; i<xyz.length; i++) {
				that.move(xyz[i]);
			}
			return that;
		}
		var dst = {
			x: xyz.x == null ? that.position.x : xyz.x,
			y: xyz.y == null ? that.position.y : xyz.y,
			z: xyz.z == null ? that.position.z : xyz.z,
		};
		var pulses = that.delta.calcPulses(dst);
		var cmd = {
			mov:{
				x:pulses.p1,
				y:pulses.p2,
				z:pulses.p3,
			}
		};
		that.write(JSON.stringify(cmd));
		that.write("\n");
		that.position = dst;
		return that;
	}
	FireStep.prototype.origin = function() {
		var that = this;
		that.home();
		that.move({x:0,y:0,z:0});
		return that;
	}
	FireStep.prototype.getPulses = function() {
		var that = this;
		return that.delta.calcPulses(that.position);
	}
	FireStep.prototype.jumpTo = function(xyz) {
		var that = this;
		var dst = {
			x: xyz.x == null ? that.position.x : xyz.x,
			y: xyz.y == null ? that.position.y : xyz.y,
			z: xyz.z == null ? that.position.z : xyz.z,
		};
		var nTakeoff = 5;
		var pnp = new PnPPath(that.position, dst, {
			hCruise: that.hCruise,
			tauTakeoff: 1/nTakeoff,
		});
		var waypoints = pnp.waypointPulses(that.delta);
		var pts1 = [];
		var pts2 = [];
		var pts3 = [];
		var dIm = Math.abs(that.delta.homePulses.p1/nTakeoff); 
		logger.debug("dIm:", dIm);
		for (var i=0; i<waypoints.length; i++) {
			logger.info("waypoints[",i,"]:", waypoints[i]);
			pts1.push({re:waypoints[i].p1, im:i*dIm});
			pts2.push({re:waypoints[i].p2, im:i*dIm});
			pts3.push({re:waypoints[i].p3, im:i*dIm});
		}
		var feedOpts = {vMax:that.vMax, tvMax:that.tvMax};
		var ph1 = new PHFactory(pts1).quintic();
		var ph2 = new PHFactory(pts2).quintic();
		var ph3 = new PHFactory(pts3).quintic();
		var ph = ph1.s(1) > ph2.s(1) ? ph1 : ph2;
		ph = ph.s(1) > ph3.s(1) ? ph : ph3;
		var phf = new PHFeed(ph, feedOpts);
		var N = 64;
		var E = phf.Ekt(0,0);
		var posPulses = that.delta.calcPulses(that.position);
		logger.debug("posPulses:", posPulses);
		var scale = 2;
		var r1Prev = Math.round(posPulses.p1/scale);
		var r2Prev = Math.round(posPulses.p2/scale);
		var r3Prev = Math.round(posPulses.p3/scale);
		var v1 = 0;
		var v2 = 0;
		var v3 = 0;
		var p1 = "";
		var p2 = "";
		var p3 = "";
		for (var i=1; i<=N; i++) {
			var tau = i/N;
			E = phf.Ekt(E, tau);
			var pre1 = ph1.r(E).re;
			var pre2 = ph2.r(E).re;
			var pre3 = ph3.r(E).re;
			var r1 = Math.round(pre1/scale);
			var r2 = Math.round(pre2/scale);
			var r3 = Math.round(pre3/scale);
			var dr1 = r1 - r1Prev;
			var dr2 = r2 - r2Prev;
			var dr3 = r3 - r3Prev;
			var dv1 = dr1 - v1;
			var dv2 = dr2 - v2;
			var dv3 = dr3 - v3;
			p1 += FireStep.byteToHex(dv1);
			p2 += FireStep.byteToHex(dv2);
			p3 += FireStep.byteToHex(dv3);
			var xyzi = that.delta.calcXYZ({p1:pre1, p2:pre2, p3:pre3});
			logger.withPlaces(2).info("i:", i, " tau:", tau, " r1:", r1, " r2:", r2, " r3:", r3,
				" dv1:", dv1, " dv2:", dv2, " dv3:", dv3, " xyzi:", xyzi);
			v1 += dv1;
			v2 += dv2;
			v3 += dv3;
			r1Prev = r1;
			r2Prev = r2;
			r3Prev = r3;
		}
		logger.debug("p1:", p1);
		logger.debug("p2:", p2);
		logger.debug("p3:", p3);
		var endPulses = that.delta.calcPulses(xyz);
		logger.debug("endPulses:", endPulses);
		var dvs = {'dvs':{
			'sc':scale,
			'us':Math.round(phf.tS * 1000000),
			'dp':{
				'1':endPulses.p1-posPulses.p1,
				'2':endPulses.p2-posPulses.p2,
				'3':endPulses.p3-posPulses.p3,
				},
			'1':p1,
			'2':p2,
			'3':p3,
		}};
		var dvsJson = JSON.stringify(dvs);
		logger.info("dvs:", dvsJson.length, "B ", dvsJson);
		that.write(dvsJson);
		that.write("\n");
		that.position = xyz;
		return that;
	}

	///////////////// CLASS //////////
	FireStep.setLogger = function(value) {
		should(value.info)
		logger = value;
	}
	FireStep.getLogger = function() {
		return logger || new Logger();
	}
	FireStep.byteToHex = function(byte) {
		return byteHex[(byte>>4)&0xf] + byteHex[byte&0xf];
	}

    Logger.logger.info("loaded firepick.FireStep");
    module.exports = firepick.FireStep = FireStep;
})(firepick || (firepick = {}));


(typeof describe === 'function') && describe("firepick.FireStep", function() {
	var logger = new Logger({
		nPlaces:1,
		logLevel:"info"
	});
	var FireStep = firepick.FireStep;
	var pt1 = {x:10, y:20, z:-50};
	var pt2 = {x:-90, y:21, z:-60};
	var e = 0.000001;
	var testOut = "";
	var testWrite = function(msg) {testOut += msg;};

	function testCmd(cmd, expected) {
		testOut = "";
		cmd();
		testOut.should.equal(expected);
	}
	function shouldEqualT(a,b,tolerance) {
		tolerance = tolerance || 0.001;
		for (var k in a) {
			var msg = "shouldEqualT({" + k + ":" + a[k] 
				+ "}, {" + k + ":" + b[k] + "} FAIL";
			a[k].should.within(b[k]-tolerance, b[k]+tolerance, msg);
		}
	}
	it("has a DeltaCalculator option", function() {
		new FireStep().delta.should.instanceof(DeltaCalculator);
		var dc = new DeltaCalculator();
		new FireStep({delta:dc}).delta.should.equal(dc);
	});
	it("has position option", function() {
		shouldEqualT(new FireStep().position, {x:0,y:0,z:0});
		shouldEqualT(new FireStep({position:{x:1,y:2,z:3}}).position, {x:1,y:2,z:3});
	});
	it("has a cruise height (mm) option", function() {
		new FireStep().hCruise.should.equal(20);
		new FireStep({hCruise:21}).hCruise.should.equal(21);
	});
	it("has maximum velocity (pulses/second) option", function() {
		new FireStep().vMax.should.equal(12800);
		new FireStep({vMax:20000}).vMax.should.equal(20000);
	});
	it("has seconds to maximum velocity option", function() {
		new FireStep().tvMax.should.equal(0.4);
		new FireStep({tvMax:0.7}).tvMax.should.equal(0.7);
	});
	it("has a write() option", function() {
		new FireStep().write.should.be.Function;
		new FireStep({write:testWrite}).write("hello");
		testOut.should.equal("hello");
	});
	it("should implement home()", function() {
		var fs = new FireStep({write:testWrite});
		testCmd(function(){ fs.home(); },'{"hom":{"x":-11200,"y":-11200,"z":-11200}}\n');
		shouldEqualT(fs.position, fs.delta.calcXYZ(fs.delta.homeAngles));
	});
	it("getPulses() should return pulse position", function() {
		var fs = new FireStep();
		shouldEqualT(fs.move({x:1,y:2,z:3}).getPulses(), {p1:-227,p2:-406,p3:-326});
	});
	it("should implement getXYZ()", function() {
		shouldEqualT(new FireStep().getXYZ(), {x:0,y:0,z:0});
		shouldEqualT(new FireStep({position:{x:1,y:2,z:3}}).getXYZ(), {x:1,y:2,z:3});
	});
	it("should implement move()", function() {
		var fs = new FireStep({write:testWrite});
		testCmd(function(){ fs.move({x:1,y:2,z:3}); },
			'{"mov":{"x":-227,"y":-406,"z":-326}}\n'
		);
		shouldEqualT(fs.getXYZ(),{x:1,y:2,z:3});
		testCmd(function(){ fs.move({x:0,y:0,z:0}); },
			'{"mov":{"x":0,"y":0,"z":0}}\n'
		);
		shouldEqualT(new FireStep().getXYZ(), {x:0,y:0,z:0});
	});
	it("should implement origin()", function() {
		var fs = new FireStep({write:testWrite});
		testCmd(function(){ fs.origin(); },
			'{"hom":{"x":-11200,"y":-11200,"z":-11200}}\n' +
			'{"mov":{"x":0,"y":0,"z":0}}\n'
		);
		shouldEqualT(fs.getXYZ(), {x:0,y:0,z:0});
	});
	it("should implement XYZPositioner", function() {
		XYZPositioner.validate(new FireStep());
	});
	it("byteToHex() should return hex string of byte", function() {
		FireStep.byteToHex(0x00).should.equal("00");
		FireStep.byteToHex(0x10).should.equal("10");
		FireStep.byteToHex(0x02).should.equal("02");
		FireStep.byteToHex(0x30).should.equal("30");
		FireStep.byteToHex(0x04).should.equal("04");
		FireStep.byteToHex(0x50).should.equal("50");
		FireStep.byteToHex(0x06).should.equal("06");
		FireStep.byteToHex(0x70).should.equal("70");
		FireStep.byteToHex(0x08).should.equal("08");
		FireStep.byteToHex(0x90).should.equal("90");
		FireStep.byteToHex(0x0A).should.equal("0A");
		FireStep.byteToHex(0xB0).should.equal("B0");
		FireStep.byteToHex(0x0C).should.equal("0C");
		FireStep.byteToHex(0xD0).should.equal("D0");
		FireStep.byteToHex(0x0E).should.equal("0E");
		FireStep.byteToHex(0xFF).should.equal("FF");
	});
	it("jumpTo() should traverse pick and place path", function() {
		var fs = new FireStep({write:testWrite});
		fs.move({x:100,y:0,z:-70});
		shouldEqualT(fs.getPulses(), {p1:9563, p2:5959, p3:12228});
		testCmd(function(){ fs.jumpTo({x:-100,y:0,z:-80}); },
			'{"dvs":{'+
				'"1":"FF01FDFBFAF7F5F2F1EFEEF0EFF0F3F4FA00080E161818161311100D0D0C0A0A'+
					 '090808070606040405040304040303040304040300FCF6F1EEECEAEDF0F6FAFE",'+
				'"2":"FF00FBF9F6F1F3F0F5F5FBFE030306070A0D1113181515110E0C090907060606'+
					 '0504040303030102000101000000FFFF01FE00FEFCF7F2EEEDEAECEDF2F6FBFE",'+
				'"3":"0000FEFFFCFBF7F6F0EDE9E6E5E6E3E8ECF3FA050F13151515141211100F0D0D'+
					 '0C0A090A070608050507040606060607060708070501FDF8F3F0EFF1F2F7FAFF",'+
				'"sc":2,"us":1873817,"dp":{"1":1556,"2":7742,"3":-4881}}}'
		+'\n');
		shouldEqualT(fs.getPulses(), {p1:11119, p2:13701, p3:7347});
	});
	it("TESTTESTjumpTo() should avoid obstacles", function() {
		var fs = new FireStep({write:testWrite});
		fs.move({x:90,y:30,z:-70});
		shouldEqualT(fs.getPulses(), {p1:10337, p2:5443, p3:11339});
		testCmd(function(){ fs.jumpTo({x:30,y:90,z:-80}); },
			'{"dvs":{'+
				'"1":"FF01FDFBFAF7F5F2F1EFEEF0EFF0F3F4FA00080E161818161311100D0D0C0A0A'+
					 '090808070606040405040304040303040304040300FCF6F1EEECEAEDF0F6FAFE",'+
				'"2":"FF00FBF9F6F1F3F0F5F5FBFE030306070A0D1113181515110E0C090907060606'+
					 '0504040303030102000101000000FFFF01FE00FEFCF7F2EEEDEAECEDF2F6FBFE",'+
				'"3":"0000FEFFFCFBF7F6F0EDE9E6E5E6E3E8ECF3FA050F13151515141211100F0D0D'+
					 '0C0A090A070608050507040606060607060708070501FDF8F3F0EFF1F2F7FAFF",'+
				'"sc":2,"us":1873817,"dp":{"1":1556,"2":7742,"3":-4881}}}'
		+'\n');
		shouldEqualT(fs.getPulses(), {p1:11119, p2:13701, p3:7347});
	});
})
