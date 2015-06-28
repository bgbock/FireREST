var should = require("should"),
    module = module || {},
    firepick = firepick || {};
var fs = require("fs");
var path = require("path");
var os = require("os");
firepick.Camera = require("./Camera");
firepick.ImageRef = require("./ImageRef");

function isNumeric(obj) {
    return (obj - parseFloat(obj) + 1) >= 0;
}

(function(firepick) {
	var logger = new Logger();
    function ImageStore(camera, options) {
        var that = this;
        options = options || {};
        that.camera = camera || new firepick.Camera();
        that.images = options.images || {};
        that.path = options.path || os.tmpDir();
        that.prefix = path.join(that.path, options.prefix || "ImageStore");
        that.suffix = options.suffix || ".jpg";
        return that;
    };
    /////////////// INSTANCE ////////////
    ImageStore.prototype.health = function() {
        var that = this;
        return that.camera.health();
    };
    ImageStore.prototype.parseImageRef = function(path) {
        var that = this;
        var suffixPos = path.lastIndexOf(that.suffix);
        path = suffixPos < 0 ? path : path.slice(0, suffixPos);
        var prefixPos = path.indexOf(that.prefix);
        path = prefixPos < 0 ? path : path.slice(prefixPos + that.prefix.length);
        return firepick.ImageRef.parse(path);
    }
    ImageStore.prototype.clear = function() {
        var that = this;
        that.images = {};
        return that;
    };
    ImageStore.prototype.peek = function(imgRef) {
        var that = this;
        if (imgRef == null) {
            return null;
        }
        var key = firepick.ImageRef.keyOf(imgRef);
        return that.images[key];
    }
    ImageStore.prototype.load = function(imgRef, srcPath) {
        should.exist(imgRef);
        var that = this;
        var key = firepick.ImageRef.keyOf(imgRef);
        var theRef = that.images[key];
        if (theRef == null) {
            theRef = firepick.ImageRef.copy(imgRef);
            that.images[key] = theRef;
            theRef.path = that.prefix + key + that.suffix;
        }
        if (srcPath != null) {
            should(srcPath).be.a.String;
            fs.writeFileSync(theRef.path, fs.readFileSync(srcPath));
        }
        return theRef;
    }
    ImageStore.prototype.capture = function(imgRef) {
        var that = this;
        should.exist(imgRef);
        var capturedRef = that.camera.capture(imgRef);
        return that.load(capturedRef, capturedRef.path);
    }
	ImageStore.prototype.serialize = function(fname) {
		var that = this;
		fs.writeFileSync(fname, JSON.stringify(that.images));
	}
	ImageStore.prototype.deserialize = function(fname) {
		var that = this;
		var json = fs.readFileSync(fname);
		that.images = JSON.parse(json);
	}

    /////////////// GLOBAL /////////////
    ImageStore.validatex = function(imgStore) {
        var storeClass = imgStore.constructor.name;
        describe("ImageStore.validate(" + storeClass + ")", function() {
            var ref123 = new firepick.ImageRef(1, 2, 3, {
                tag: "test",
                version: 1
            });
            it("should parse an ImageREf from a path", function() {
                var path123 = imgStore.load(ref123).path;
                var parse123 = imgStore.parseImageRef(path123);
                should.equal(0, firepick.ImageRef.compare(parse123, ref123));
            });
            it("load(imgRef, srcPath) should store an external image and return its ImageRef", function() {
                var srcPath = "test/camX0Y0Z0a.jpg";
                var imgRef = {
                    x: 1,
                    y: 2,
                    z: 3,
                    tag: "test-load",
                    version: 1
                };
                var theRef = imgStore.load(imgRef, srcPath);
                should(theRef).have.properties(imgRef);
                var key = firepick.ImageRef.keyOf(imgRef);
                should(theRef.path).equal(imgStore.prefix + key + imgStore.suffix);
                should.ok(theRef.exists());
            });
            it("load(imgRef) should register an ImageRef that can be loaded later", function() {
                var srcPath = "test/camX0Y0Z0a.jpg";
                var imgRef = {
                    x: 1,
                    y: 2,
                    z: 3,
                    tag: "test-load",
                    version: 2
                };
                var theRef = imgStore.load(imgRef);
                should.exist(theRef);
                var theRef2 = imgStore.load(imgRef, srcPath);
                should.equal(theRef2, theRef);
                should.ok(theRef.exists());
            });
            it("peek(imgRef) should return the stored ImageRef or null", function() {
                var ref123 = imgStore.peek({
                    x: 1,
                    y: 2,
                    z: 3,
                    tag: "test-load",
                    version: 1
                });
                should(ref123).have.properties(ref123);
                var refBad = imgStore.peek({
                    x: 1,
                    y: 2,
                    z: 3,
                    tag: "test-load",
                    version: 911
                });
                should.ok(refBad == null);

            });
            it("peek(imgRef) should return unique, client-mutable ImageRef", function() {
                var ref123 = imgStore.peek({
                    x: 1,
                    y: 2,
                    z: 3,
                    tag: "test-load",
                    version: 1
                });
                ref123.color = "pink";
                var ref123_again = imgStore.peek({
                    x: 1,
                    y: 2,
                    z: 3,
                    tag: "test-load",
                    version: 1
                });
                should(ref123_again).have.properties({
                    color: "pink"
                });
            });
        });
    };

    Logger.logger.info("loaded firepick.ImageStore");
    module.exports = firepick.ImageStore = ImageStore;
})(firepick || (firepick = {}));

(typeof describe === 'function') && describe("firepick.ImageStore test", function() {
    var camera1 = new firepick.Camera(["test/camX0Y0Z0a.jpg"]);
    var camera2 = new firepick.Camera(["test/camX0Y0Z0a.jpg"]);
    var imgStore = new firepick.ImageStore(camera1);
    var imgStoreTest = new firepick.ImageStore(camera2, {
        prefix: "Test",
        suffix: ".JPG"
    });
    firepick.ImageStore.validatex(imgStore);
    firepick.ImageStore.validatex(imgStoreTest);

    describe("Test ImageStore extensions", function() {
        var ref123 = new firepick.ImageRef(1, 2, 3, {
            tag: "test",
            version: 1
        });
        it("should clear", function() {
            should(imgStore.clear()).equal(imgStore);
            should.not.exist(imgStore.peek(ref123));
        });
    });
	it("serialize() should save ImageStore to file", function() {
		var fname = "test_ImageStore_serialize.json";
		var imgStore1 = new ImageStore();
		var imgRef1 = new ImageRef(0,0,0,{tag:"red"});
		var imgRef1Copy = ImageRef.copy(imgRef1);
		var imgPath1 = "test/XP005_Z0X0Y0@1#1.jpg";
		var imgRef2 = new ImageRef(0,0,-10,{tag:"blue"});
		var imgRef2Copy = ImageRef.copy(imgRef2);
		var imgPath2 = "test/XP005_Z-010X0Y0@1#1.jpg";
		imgStore1.load(imgRef1, imgPath1);
		imgStore1.load(imgRef2, imgPath2);
		imgStore1.peek(imgRef1Copy).should.have.properties({"path":"/tmp/ImageStore_0_0_0#red.jpg"});
		imgStore1.serialize(fname);
		var imgStore2 = new ImageStore();
		imgStore2.deserialize(fname);
		logger.info("imgStore2:", imgStore2);
		imgStore2.peek(imgRef1Copy).should.have.properties({"path":"/tmp/ImageStore_0_0_0#red.jpg"});
		fs.unlink(fname);
	});
})
