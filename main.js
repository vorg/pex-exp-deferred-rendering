var sys = require('pex-sys');
var glu = require('pex-glu');
var materials = require('pex-materials');
var color = require('pex-color');
var gen = require('pex-gen');
var geom = require('pex-geom');

var Box               = gen.Box;
var Sphere            = gen.Sphere;
var Mesh              = glu.Mesh;
var PerspectiveCamera = glu.PerspectiveCamera;
var Arcball           = glu.Arcball;
var ShowNormals       = materials.ShowNormals;
var SolidColor        = materials.SolidColor;
var Color             = color.Color;
var Platform          = sys.Platform;
var Time              = sys.Time;
var Vec3              = geom.Vec3;

sys.Window.create({
  settings: {
    width: 1280,
    height: 720,
    type: '3d',
    fullscreen: Platform.isBrowser ? true : false
  },
  init: function() {
    var g = new Box().extrude(1).catmullClark().catmullClark();
    g.computeNormals();
    this.mesh = new Mesh(g, new ShowNormals());

    this.camera = new PerspectiveCamera(60, this.width / this.height);
    this.arcball = new Arcball(this, this.camera, 5);

    this.numLights = 50;

    geom.randomSeed(0);

    this.lights = [];
    for(var i=0; i<this.numLights; i++) {
      this.lights.push({
        position: new Vec3(0, 0, 0),
        t: 0,
        k1: geom.randomFloat(0, 5),
        k2: geom.randomFloat(0, 5),
        r: geom.randomFloat(1, 3),
        uniforms: {
          color: Color.fromHSL(geom.randomFloat(0, 1), 1, 0.5)
        }
      });
    }

    this.lightMesh = new Mesh(new Sphere(0.1), new SolidColor());
    this.lightProxyMesh = new Mesh(new Sphere(1), new SolidColor());
  },
  draw: function() {
    glu.clearColorAndDepth(Color.Black);
    glu.enableDepthReadAndWrite(true);
    this.mesh.draw(this.camera);

    this.lights.forEach(function(light) {
      light.position.x = light.r * Math.sin(light.k1 * Time.seconds + light.k2)
      light.position.y = light.r * Math.cos(Time.seconds + light.k2)
      light.position.z = light.r * Math.sin(Time.seconds + 0.5 * light.k2) + Math.sin(Time.seconds + light.k1)
    })

    this.lightProxyMesh.drawInstances(this.camera, this.lights);
  }
});
