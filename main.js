var sys = require('pex-sys');
var glu = require('pex-glu');
var materials = require('pex-materials');
var color = require('pex-color');
var gen = require('pex-gen');
var geom = require('pex-geom');
var fx = require('pex-fx');
var gui = require('pex-gui');

var Box                 = gen.Box;
var Sphere              = gen.Sphere;
var Dodecahedron        = gen.Dodecahedron;
var Tetrahedron         = gen.Tetrahedron;
var Mesh                = glu.Mesh;
var PerspectiveCamera   = glu.PerspectiveCamera;
var Arcball             = glu.Arcball;
var ShowNormals         = materials.ShowNormals;
var SolidColor          = materials.SolidColor;
var ShowDepth           = materials.ShowDepth;
var Color               = color.Color;
var Platform            = sys.Platform;
var Time                = sys.Time;
var Vec3                = geom.Vec3;
var Quat                = geom.Quat;
var GUI                 = gui.GUI;
var Deferred            = require('./fx/Deferred');
var DeferredPointLight  = require('./materials/DeferredPointLight');
var SSAO                = require('./fx/SSAO');
var Contrast            = require('./fx/Contrast');

sys.Window.create({
  settings: {
    width: 1024,
    height: 512,
    type: '3d',
    //fullscreen: Platform.isBrowser ? true : false,
    borderless: true
  },
  animate: false,
  exposure: 1,
  contrast: 1,
  ssaoStrength: 0.4,
  correctGamma: true,
  tonemapReinhard: true,
  roughness: 0.3,
  lightRadius: 3,
  init: function() {
    if (Platform.isBrowser) {
      console.log('OES_texture_float', this.gl.getExtension("OES_texture_float"));
      console.log('OES_texture_float_linear', this.gl.getExtension("OES_texture_float_linear"));
      console.log('OES_texture_half_float', this.gl.getExtension("OES_texture_half_float"));
      console.log('OES_texture_half_float_linear', this.gl.getExtension("OES_texture_half_float_linear"));
      //console.log('EXT_shader_texture_lod', this.gl.getExtension("EXT_shader_texture_lod"));
      //console.log('OES_standard_derivatives', this.gl.getExtension("OES_standard_derivatives"));
    }
    this.gui = new GUI(this);
    this.gui.addParam('Animate', this, 'animate');
    this.gui.addParam('SSAO Strength', this, 'ssaoStrength', { min: 0.0, max: 1 });
    this.gui.addParam('Roughness', this, 'roughness', { min: 0.01, max: 1 });
    this.gui.addParam('Tonemap Reinhard', this, 'tonemapReinhard');
    this.gui.addParam('Exposure', this, 'exposure', { min: 0.5, max: 3 });
    this.gui.addParam('Correct Gamma', this, 'correctGamma');
    this.gui.addParam('Contrast', this, 'contrast', { min: 0.5, max: 3 });

    this.scene = [];

    var star = new Box().catmullClark().extrude(1).catmullClark().extrude().catmullClark();
    star.computeNormals();
    this.scene.push(new Mesh(star, null));

    var sphere = new Tetrahedron(0.6).dooSabin().triangulate().catmullClark();
    sphere.computeNormals();
    for(var i=0; i<50; i++) {
      var m = new Mesh(sphere, null);
      m.position = geom.randomVec3().normalize().scale(geom.randomFloat(1, 6));
      m.rotation = Quat.fromDirection(geom.randomVec3().normalize());
      this.scene.push(m);
    }

    this.camera = new PerspectiveCamera(60, this.width / this.height, 1, 10);
    this.arcball = new Arcball(this, this.camera, 5);

    this.lightPos = new Vec3(3, 3, 3);
    this.lightBrightness = 5;

    this.numLights = 20;

    geom.randomSeed(0);

    this.lights = [];
    for(var i=0; i<this.numLights; i++) {
      this.lights.push({
        position: new Vec3(0, 0, 0),
        scale: new Vec3(1, 1, 1),
        t: 0,
        k1: geom.randomFloat(0, 5),
        k2: geom.randomFloat(0, 5),
        r: geom.randomFloat(1, 3),
        uniforms: {
          color: Color.fromHSL(geom.randomFloat(0.6, 0.99), 0.8, 0.35)
        }
      });
    }

    this.lightMesh = new Mesh(new Sphere(0.05), new SolidColor());

    this.deferredPointLight = new DeferredPointLight();
    this.lightProxyMesh = new Mesh(new Sphere(this.lightRadius, 128, 128), this.deferredPointLight);
  },
  drawColor: function() {
    if (!this.solidColor) {
      this.solidColor = new SolidColor({ color: Color.White });
    }
    this.drawScene(this.solidColor);
  },
  drawNormals: function() {
    if (!this.showNormals) {
      this.showNormals = new ShowNormals({ color: Color.Red });
    }
    this.drawScene(this.showNormals);
  },
  drawDepth: function() {
    var gl = this.gl;
    gl.clearColor(1,1,1,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.showDepth) {
      this.showDepth = new ShowDepth();
    }
    this.showDepth.uniforms.near = this.camera.getNear();
    this.showDepth.uniforms.far = this.camera.getFar();
    this.drawScene(this.showDepth);
  },
  drawScene: function(material) {
    this.scene.forEach(function(m) {
      m.setMaterial(material);
      m.draw(this.camera);
    }.bind(this));
  },
  drawDeferredLights: function() {
    glu.clearColor(Color.Black);
    glu.enableDepthReadAndWrite(false, false);
    glu.enableAdditiveBlending(true);

    for(var i=0; i<this.lights.length; i++) {
      this.lights[i].uniforms.lightPos = this.lights[i].position;
      this.lights[i].uniforms.lightColor = this.lights[i].uniforms.color;
    }
    this.lightProxyMesh.drawInstances(this.camera, this.lights);
    glu.enableBlending(false);
  },
  update: function() {
    if (!this.time) {
      this.time = 0;
    }
    if (this.animate) {
      this.time += Time.delta;
    }
    this.lights.forEach(function(light) {
      light.position.x = light.r * Math.sin(this.time + light.k1)
      light.position.y = light.r * Math.cos(this.time + light.k2)
      light.position.z = light.r * Math.sin(this.time + 0.5 * light.k2) + Math.sin(this.time + light.k1)
    }.bind(this));

    this.lightPos = this.lights[0].position;
    this.lightPos = new Vec3(0, 0, 1);
  },
  draw: function() {
    this.update();

    glu.clearColorAndDepth(Color.Black);
    glu.enableDepthReadAndWrite(true);
    glu.cullFace(true);

    var W = this.width;
    var H = this.height;

    var root = fx();
    var color = root.render({ drawFunc: this.drawColor.bind(this), depth: true, width: W, height: H, bpp: 32 });
    var normals = root.render({ drawFunc: this.drawNormals.bind(this), depth: true, width: W, height: H, bpp: 32 });
    var depth = root.render({ drawFunc: this.drawDepth.bind(this), depth: true, width: W, height: H, bpp: 32 });
    var ssao = depth.ssao({ cutoutBg: 0, strength: this.ssaoStrength, depthMap: depth, width: W, height: H, bpp: 32, camera: this.camera });

    this.deferredPointLight.uniforms.albedoMap = color.getSourceTexture();
    this.deferredPointLight.uniforms.normalMap = normals.getSourceTexture();
    this.deferredPointLight.uniforms.depthMap = depth.getSourceTexture();
    this.deferredPointLight.uniforms.occlusionMap = ssao.getSourceTexture();
    this.deferredPointLight.uniforms.roughness = this.roughness;
    this.deferredPointLight.uniforms.fov = this.camera.getFov();
    this.deferredPointLight.uniforms.near = this.camera.getNear();
    this.deferredPointLight.uniforms.far = this.camera.getFar();
    this.deferredPointLight.uniforms.aspectRatio = this.camera.getAspectRatio();
    this.deferredPointLight.uniforms.lightPos = new Vec3(0, 0, 0);
    this.deferredPointLight.uniforms.lightBrightness = this.lightBrightness;
    this.deferredPointLight.uniforms.lightColor = Color.White;
    this.deferredPointLight.uniforms.lightRadius = this.lightRadius;
    var lights = root.render({ drawFunc: this.drawDeferredLights.bind(this), width: W, height: H, bpp: 32 });
    var finalColor = lights;
    var deferred = root.deferred({
     width: W, height: H, bpp: 32,
     albedoMap: color, normalMap: normals, depthMap: depth,
     camera: this.camera,
     lightPos: this.lights[0].position, lightBrightness: this.lightBrightness, lightColor: this.lights[0].uniforms.color, lightRadius: this.lightRadius,
     occlusionMap: ssao,
     roughness: this.roughness
    });
    //finalColor = deferred;

    if (this.tonemapReinhard) finalColor = finalColor.tonemapReinhard({ width: W, height: H, bpp: 32, exposure: this.exposure });
    if (this.correctGamma) finalColor = finalColor.correctGamma({ width: W, height: H, bpp: 32 });
    finalColor = finalColor.contrast({ width: W, height: H, bpp: 32, contrast: this.contrast });
    finalColor.blit();
    //ssao.blit()

    this.lightMesh.drawInstances(this.camera, this.lights);

    this.gui.draw();
  }
});
