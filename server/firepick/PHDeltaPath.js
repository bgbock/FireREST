var should = require("should"),
    module = module || {},
    firepick = firepick || {};
Logger = require("./Logger");
PHFactory = require("./PHFactory");
PH5Curve = require("./PH5Curve");
PHFeed = require("./PHFeed");
DeltaCalculator = require("./DeltaCalculator");

(function(firepick) {
    function PHDeltaPath(xyz, options) {
		var that = this;

		xyz.length.should.above(1);
		options = options || {};
		that.vMax = options.vMax || 200;
		that.tvMax = options.tvMax || 0.1;
		that.vIn = options.vIn || 0;
		that.vCruise = options.vCruise || that.vMax;
		that.vOut = options.vOut || 0;
		that.N = options.N || 6;
		that.delta = options.delta || new DeltaCalculator(options);
		that.logger = options.logger || new Logger(options);

		var xy = [];
		var xz = [];
		var yz = [];
		for (var i=0; i<xyz.length; i++) {
			xy.push(new Complex(xyz[i].x, xyz[i].y));
			xz.push(new Complex(xyz[i].x, xyz[i].z));
			yz.push(new Complex(xyz[i].y, xyz[i].z));
		}
		var xyPH = new PHFactory(xy).quintic();
		that.logger.info("xyPH.z", xyPH.z);
		var xzPH = new PHFactory(xz).quintic();
		that.logger.info("xzPH.z", xzPH.z);
		var yzPH = new PHFactory(yz).quintic();
		that.logger.info("yzPH.z", yzPH.z);
		var xyzFeedOptions = {
			vIn:that.vMax, 			// assume constant speed
		};
		that.xyPHF = new PHFeed(xyPH, xyzFeedOptions);
		that.xzPHF = new PHFeed(xzPH, xyzFeedOptions);
		that.yzPHF = new PHFeed(yzPH, xyzFeedOptions);
		var theta12 = [];
		var theta13 = [];
		var theta23 = [];
		var xyz = that.xyzA0Iterate();
		var angles = that.delta.calcAngles(xyz);
		that.logger.trace("angles:", angles);
		theta12.push(new Complex(angles.theta1, angles.theta2));
		theta13.push(new Complex(angles.theta1, angles.theta3));
		theta23.push(new Complex(angles.theta2, angles.theta3));
		for (var i=1; i<that.N; i++) {
			var tau = i/(that.N-1);
			xyz = that.xyzA0Iterate(tau,xyz);
			angles = that.delta.calcAngles(xyz);
			that.logger.trace("angles:", angles);
			theta12.push(new Complex(angles.theta1, angles.theta2));
			theta13.push(new Complex(angles.theta1, angles.theta3));
			theta23.push(new Complex(angles.theta2, angles.theta3));
		}
		var angleFeedOptions = {
			vIn:that.vIn, 
			vCruise:that.vCruise, 
			vOut:that.vOut, 
			vMax:that.vMax, 
			tvMax:that.tvMax
		};
		var theta12PH = new PHFactory(theta12).quintic();
		that.theta12PHF = new PHFeed(theta12PH, angleFeedOptions);
		that.logger.info("theta12PHF.tS:", that.theta12PHF.tS);
		var theta13PH = new PHFactory(theta13).quintic();
		that.theta13PHF = new PHFeed(theta13PH, angleFeedOptions);
		that.logger.info("theta13PHF.tS:", that.theta13PHF.tS);
		var theta23PH = new PHFactory(theta23).quintic();
		that.theta23PHF = new PHFeed(theta23PH, angleFeedOptions);
		that.logger.info("theta23PHF.tS:", that.theta23PHF.tS);
		that.tS = Math.max(that.theta12PHF.tS, that.theta12PHF.tS);
		that.tS = Math.max(that.tS, that.theta23PHF.tS);

		return that;
    };

	///////////////// INSTANCE API ///////////////
	PHDeltaPath.prototype.xyzA0Iterate = function(p, prev) {
		var that = this;
		var epsilon = 0.000000001;
		p = p || 0;
		p.should.within(0,1);
		if (prev == null) {
			p.should.equal(0);
			var cxy = that.xyPHF.ph.r(0);
			var cxz = that.xzPHF.ph.r(0);
			var cyz = that.yzPHF.ph.r(0);
			cxy.re.should.within(cxz.re-epsilon,cxz.re+epsilon);
			cxy.im.should.within(cyz.re-epsilon,cyz.re+epsilon);
			return {p:0, x:cxy.re, y:cxy.im, z:cxz.im, Exy:0, Exz:0, Eyz:0};
		}
		prev.Exy.should.within(0,1);
		prev.Exz.should.within(0,1);
		prev.Eyz.should.within(0,1);
		var Exy = that.xyPHF.Ekt(prev.Exy, p);
		var Exz = that.xzPHF.Ekt(prev.Exz, p);
		var Eyz = that.xzPHF.Ekt(prev.Eyz, p);
		var cxy = that.xyPHF.ph.r(Exy);
		var cxz = that.xzPHF.ph.r(Exz);
		var cyz = that.yzPHF.ph.r(Exz);
		cxy.re.should.within(cxz.re-epsilon,cxz.re+epsilon);
		cxy.im.should.within(cyz.re-epsilon,cyz.re+epsilon);
		return {p:p, x:cxy.re, y:cxy.im, z:cxz.im, Exy:Exy, Exz:Exz, Eyz:Eyz};
	};
	PHDeltaPath.prototype.thetaIterate = function(tau, prev) {
		var that = this;
		var epsilon = 0.000000001;
		tau = tau || 0;
		tau.should.within(0,1);
		if (prev == null) {
			tau.should.equal(0);
			var c12 = that.theta12PHF.ph.r(0);
			var c13 = that.theta13PHF.ph.r(0);
			var c23 = that.theta23PHF.ph.r(0);
			c12.re.should.within(c13.re-epsilon,c13.re+epsilon);
			return {tau:0, theta1:c12.re, theta2:c12.im, theta3:c13.im, E12:0, E13:0, E23:0};
		}
		prev.E12.should.within(0,1);
		prev.E13.should.within(0,1);
		prev.E23.should.within(0,1);
		var E12 = that.theta12PHF.Ekt(prev.E12, tau);
		var E13 = that.theta13PHF.Ekt(prev.E13, tau);
		var E23 = that.theta13PHF.Ekt(prev.E23, tau);
		var c12 = that.theta12PHF.ph.r(E12);
		var c13 = that.theta13PHF.ph.r(E13);
		var c23 = that.theta23PHF.ph.r(E23);
		var thetaEpsilon = 0.001;
		//c12.re.should.within(c13.re-thetaEpsilon,c13.re+thetaEpsilon);
		//c12.im.should.within(c23.re-thetaEpsilon,c23.re+thetaEpsilon);
		return {tau:tau, theta1:c12.re, theta2:c12.im, theta3:c13.im, E12:E12, E13:E13, E23:E23};
	};

    Logger.logger.info("loaded firepick.PHDeltaPath");
    module.exports = firepick.PHDeltaPath = PHDeltaPath;
})(firepick || (firepick = {}));

(typeof describe === 'function') && describe("firepick.PHDeltaPath", function() {
	var logger = new Logger({
		nPlaces:1,
		logLevel:"debug"
	});
	var epsilon = 0.000001;
	var PHDeltaPath = firepick.PHDeltaPath;
	function shouldPropertiesEqualT(actual, expected, epsilon) { 
		epsilon = epsilon || 0.001; 
		for (var k in expected) {
			var msg = k + " expected:" + expected[k] + " actual:" + actual[k];
			actual[k].should.within(expected[k]-epsilon,expected[k]+epsilon, msg);
		}
	};
	it("should have default options", function() {
		var xyz = [{x:0,y:0,z:-50},{x:90,y:0,z:-50}];
		var phd = new PHDeltaPath(xyz);
		var phdOptions = new PHDeltaPath(xyz,{
			e:115,	 	// OPTION: effector equilateral triangle side
        	f:457.3,	// OPTION: base equilateral triangle side
			re:232, 	// OPTION: effector arm length
			rf:112, 	// OPTION: base arm length
			N:6,		// OPTION: number of PH points
		});
		phd.delta.should.instanceof(DeltaCalculator);	// OPTION: you can provide a DeltaCalculator or specify your own
		phd.delta.e.should.equal(phdOptions.delta.e);
		phd.delta.f.should.equal(phdOptions.delta.f);
		phd.delta.re.should.equal(phdOptions.delta.re);
		phd.delta.rf.should.equal(phdOptions.delta.rf);
		phd.delta.dz.should.equal(phdOptions.delta.dz);	// OPTION: specify z-origin offset (default is -z@theta(0,0,0))
		phd.N.should.equal(phdOptions.N);
	});
	it("xyzA0Iterate(p,prev) should traverse XYZ path at constant velocity for p:[0,1]", function() {
		var phd = new PHDeltaPath([ {x:0,y:0,z:-50},
			{x:90,y:0,z:-50},
		], {
			logger:logger,
		});
		var xyz = phd.xyzA0Iterate();
		shouldPropertiesEqualT(xyz, {p:0, x:0, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.1, xyz);
		shouldPropertiesEqualT(xyz, {p:0.1, x:8.6, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.2, xyz);
		shouldPropertiesEqualT(xyz, {p:0.2, x:17.700, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.3, xyz);
		shouldPropertiesEqualT(xyz, {p:0.3, x:26.8, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.4, xyz);
		shouldPropertiesEqualT(xyz, {p:0.4, x:35.9, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.5, xyz);
		shouldPropertiesEqualT(xyz, {p:0.5, x:45, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.6, xyz);
		shouldPropertiesEqualT(xyz, {p:0.6, x:54.1, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.7, xyz);
		shouldPropertiesEqualT(xyz, {p:0.7, x:63.2, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.8, xyz);
		shouldPropertiesEqualT(xyz, {p:0.8, x:72.3, y:0, z:-50});
		xyz = phd.xyzA0Iterate(0.9, xyz);
		shouldPropertiesEqualT(xyz, {p:0.9, x:81.4, y:0, z:-50});
		xyz = phd.xyzA0Iterate(1, xyz);
		shouldPropertiesEqualT(xyz, {p:1, x:90, y:0, z:-50});
	});
	it("TESTTESTthetaIterate(tau,prev) should traverse path angles for time tau:[0,1]", function() {
		var phd = new PHDeltaPath([ {x:0,y:0,z:-50},
			{x:90,y:0,z:-50},
		], {
			logger:logger,
		});
		var angles = phd.thetaIterate();
		shouldPropertiesEqualT(angles, {tau:0, theta1:19.403, theta2:19.403, theta3:19.403});
		var xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:0, y:0, z:-50});
		angles = phd.thetaIterate(0.1, angles);
		shouldPropertiesEqualT(angles, {tau:0.1, theta1:19.403, theta2:19.041, theta3:19.832});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:0.749, y:-0.037, z:-50.067});
		angles = phd.thetaIterate(0.2, angles);
		shouldPropertiesEqualT(angles, {tau:0.2, theta1:19.464, theta2:15.944, theta3:23.366});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:7.058, y:-0.292, z:-50.5});
		angles = phd.thetaIterate(0.3, angles);
		shouldPropertiesEqualT(angles, {tau:0.3, theta1:19.883, theta2:9.944, theta3:29.818});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:19.024, y:-0.587, z:-50.910});
		angles = phd.thetaIterate(0.4, angles);
		shouldPropertiesEqualT(angles, {tau:0.4, theta1:20.769, theta2:3.514, theta3:36.553});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:31.854, y:-0.813, z:-51.084});
		angles = phd.thetaIterate(0.5, angles);
		shouldPropertiesEqualT(angles, {tau:0.5, theta1:22.121, theta2:-2.834, theta3:43.199});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:44.765, y:-0.997, z:-51.093});
		angles = phd.thetaIterate(0.6, angles);
		shouldPropertiesEqualT(angles, {tau:0.6, theta1:23.982, theta2:-9.052, theta3:49.721});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:57.707, y:-1.041, z:-50.900});
		angles = phd.thetaIterate(0.7, angles);
		shouldPropertiesEqualT(angles, {tau:0.7, theta1:26.418, theta2:-15.066, theta3:56.097});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:70.623, y:-0.821, z:-50.517});
		angles = phd.thetaIterate(0.8, angles);
		shouldPropertiesEqualT(angles, {tau:0.8, theta1:29.298, theta2:-20.344, theta3:62.007});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:82.743, y:-0.332, z:-50.149});
		angles = phd.thetaIterate(0.9, angles);
		shouldPropertiesEqualT(angles, {tau:0.9, theta1:31.045, theta2:-22.900, theta3:65.166});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:89.223, y:-0.033, z:-50.013});
		angles = phd.thetaIterate(1, angles);
		shouldPropertiesEqualT(angles, {tau:1, theta1:31.263, theta2:-23.191, theta3:65.546});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:90, y:0, z:-50});
	});
	it("TESTTESTthetaIterate(tau,prev) should not require large N", function() {
		this.timeout(50000);
		var phd = new PHDeltaPath([ {x:0,y:0,z:-50},
			{x:90,y:0,z:-50},
		], {
			N:23,	// large N
			logger:logger,
		});
		var angles = phd.thetaIterate();
		shouldPropertiesEqualT(angles, {tau:0, theta1:19.403, theta2:19.403, theta3:19.403});
		var xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:0, y:0, z:-50});
		angles = phd.thetaIterate(0.1, angles);
		shouldPropertiesEqualT(angles, {tau:0.1, theta1:19.403, theta2:19.041, theta3:19.832});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:0.749, y:-0.037, z:-50.067});
		angles = phd.thetaIterate(0.2, angles);
		shouldPropertiesEqualT(angles, {tau:0.2, theta1:19.467, theta2:15.944, theta3:23.366});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:7.058, y:-0.288, z:-50.504});
		angles = phd.thetaIterate(0.3, angles);
		shouldPropertiesEqualT(angles, {tau:0.3, theta1:19.883, theta2:9.944, theta3:29.818});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:19.024, y:-0.587, z:-50.910});
		angles = phd.thetaIterate(0.4, angles);
		shouldPropertiesEqualT(angles, {tau:0.4, theta1:20.768, theta2:3.514, theta3:36.553});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:31.854, y:-0.815, z:-51.082});
		angles = phd.thetaIterate(0.5, angles);
		shouldPropertiesEqualT(angles, {tau:0.5, theta1:22.122, theta2:-2.834, theta3:43.199});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:44.765, y:-0.995, z:-51.093});
		angles = phd.thetaIterate(0.6, angles);
		shouldPropertiesEqualT(angles, {tau:0.6, theta1:23.982, theta2:-9.052, theta3:49.721});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:57.708, y:-1.041, z:-50.900});
		angles = phd.thetaIterate(0.7, angles);
		shouldPropertiesEqualT(angles, {tau:0.7, theta1:26.419, theta2:-15.066, theta3:56.097});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:70.623, y:-0.820, z:-50.517});
		angles = phd.thetaIterate(0.8, angles);
		shouldPropertiesEqualT(angles, {tau:0.8, theta1:29.294, theta2:-20.347, theta3:62.004});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:82.739, y:-0.335, z:-50.141});
		angles = phd.thetaIterate(0.9, angles);
		shouldPropertiesEqualT(angles, {tau:0.9, theta1:31.044, theta2:-22.902, theta3:65.166});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:89.223, y:-0.035, z:-50.010});
		angles = phd.thetaIterate(1, angles);
		shouldPropertiesEqualT(angles, {tau:1, theta1:31.263, theta2:-23.191, theta3:65.546});
		xyz = phd.delta.calcXYZ(angles);
		shouldPropertiesEqualT(xyz, {x:90, y:0, z:-50});
	});
})
