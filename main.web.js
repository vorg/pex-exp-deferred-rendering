(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"./main.js":[function(require,module,exports){
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
    fullscreen: Platform.isBrowser ? true : false,
    //highdpi: Platform.isBrowser ? 2 : false,
    borderless: true,

  },
  animate: false,
  exposure: 1,
  contrast: 1,
  ssaoStrength: 0.4,
  correctGamma: true,
  tonemapReinhard: true,
  roughness: 0.3,
  lightRadius: 2,
  numLights: 50,
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

    geom.randomSeed(0);

    var star = new Box().catmullClark().extrude(1).catmullClark().extrude().catmullClark();
    star.computeNormals();
    this.starMesh = new Mesh(star, null);
    this.scene.push(this.starMesh);

    var sphere = new Tetrahedron(0.6).dooSabin().triangulate().catmullClark();
    sphere.computeNormals();
    for(var i=0; i<50; i++) {
      var m = new Mesh(sphere, null);
      m.position = geom.randomVec3().normalize().scale(geom.randomFloat(2, 6));
      m.rotation = Quat.fromDirection(geom.randomVec3().normalize());
      this.scene.push(m);
    }

    this.camera = new PerspectiveCamera(60, 2/1, 1, 100);
    this.arcball = new Arcball(this, this.camera, 5);

    this.lightPos = new Vec3(3, 3, 3);
    this.lightBrightness = 5;
    this.solidColor = new SolidColor();


    this.lights = [];
    for(var i=0; i<this.numLights; i++) {
      this.lights.push({
        position: new Vec3(0, 0, 0),
        scale: new Vec3(1, 1, 1),
        t: 0,
        dt: geom.randomFloat(0, 1),
        k1: geom.randomFloat(0, 5),
        k2: geom.randomFloat(0, 5),
        r: geom.randomFloat(1, 3),
        uniforms: {
          //color: Color.fromHSL(geom.randomFloat(0.6, 0.99), 0.8, 0.35)
          color: Color.fromHSL(0, 0, 1)
        }
      });
    }

    this.lightMesh = new Mesh(new Sphere(0.05), new SolidColor());

    this.deferredPointLight = new DeferredPointLight();
    this.lightProxyMesh = new Mesh(new Sphere(this.lightRadius, 64, 64), this.deferredPointLight);
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
    glu.clearColorAndDepth(new Color(0.01, 0.01, 0.01, 1.0));
    glu.enableDepthReadAndWrite(false, false);
    glu.enableAdditiveBlending(true);

    var gl = this.gl;

    //'shared depth buffer with the scen'
    gl.colorMask(0, 0, 0, 0);
    glu.enableDepthReadAndWrite(true);
    gl.depthFunc(gl.LEQUAL);
    this.drawScene(this.solidColor); //just depth
    gl.colorMask(1, 1, 1, 1);
    //gl.enable(gl.DEPTH_TEST);
    //gl.enable(gl.CULL_FACE);

    gl.cullFace(gl.FRONT); gl.depthFunc(gl.GREATER);
    //gl.cullFace(gl.BACK); gl.depthFunc(gl.LESS);

    for(var i=0; i<this.lights.length; i++) {
      this.lights[i].uniforms.lightPos = this.lights[i].position;
      this.lights[i].uniforms.lightColor = this.lights[i].uniforms.color;
    }
    glu.enableDepthReadAndWrite(true, false);
    this.lightProxyMesh.drawInstances(this.camera, this.lights);
    glu.enableBlending(false);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
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
      //light.position.y = -1 + light.dt;
      light.position.z = light.r * Math.sin(this.time + 0.5 * light.k2) + Math.sin(this.time + light.k1)
      var d = 5;
      var t = (Time.seconds + light.dt * d) % (d+1);
      var a = 1/40;
      var r = 1/(a*Math.sqrt(Math.PI))*Math.pow(Math.E, -(t-d)*(t-d)/(a*a));
      light.uniforms.lightBrightness = Math.min(r, 5.0);
      light.uniforms.color.r = light.uniforms.color.g = light.uniforms.color.b = Math.min(r, 1.0);
      light.uniforms.color.b *= 1.2;
    }.bind(this));

    //this.lights.length = 1;

    this.lights[0].uniforms.lightBrightness = 0.5;
    this.lights[0].uniforms.lightRadius = this.lightRadius * 5;
    this.lights[0].uniforms.color.r = this.lights[0].uniforms.color.g = this.lights[0].uniforms.color.b = 1.0;
    this.lights[0].scale.set(1, 5, 5);
    this.lights[0].position = new Vec3(0, 2, 2);
    this.lights[0].uniforms.lightPos = this.lights[0].position;

    this.lightPos = this.lights[0].position;
    this.lightPos = new Vec3(0, 0, 1);
  },
  draw: function() {
    Time.verbose = true;
    this.update();

    glu.clearColorAndDepth(Color.Black);
    glu.enableDepthReadAndWrite(true);
    glu.cullFace(true);

    var W = 2048;
    var H = 1024;

    var root = fx();
    var color = root.render({ drawFunc: this.drawColor.bind(this), depth: true, width: W, height: H, bpp: 32 });
    var normals = root.render({ drawFunc: this.drawNormals.bind(this), depth: true, width: W, height: H, bpp: 32 });
    var depth = root.render({ drawFunc: this.drawDepth.bind(this), depth: true, width: W, height: H, bpp: 32 });
    //var ssao = depth.ssao({ cutoutBg: 0, strength: this.ssaoStrength, depthMap: depth, width: W, height: H, bpp: 32, camera: this.camera });

    this.deferredPointLight.uniforms.albedoMap = color.getSourceTexture();
    this.deferredPointLight.uniforms.normalMap = normals.getSourceTexture();
    this.deferredPointLight.uniforms.depthMap = depth.getSourceTexture();
    this.deferredPointLight.uniforms.occlusionMap = color.getSourceTexture();
    this.deferredPointLight.uniforms.roughness = this.roughness;
    this.deferredPointLight.uniforms.fov = this.camera.getFov();
    this.deferredPointLight.uniforms.near = this.camera.getNear();
    this.deferredPointLight.uniforms.far = this.camera.getFar();
    this.deferredPointLight.uniforms.aspectRatio = this.camera.getAspectRatio();
    this.deferredPointLight.uniforms.lightPos = new Vec3(0, 0, 0);
    this.deferredPointLight.uniforms.lightBrightness = this.lightBrightness;
    this.deferredPointLight.uniforms.lightColor = Color.White;
    this.deferredPointLight.uniforms.lightRadius = this.lightRadius;
    var lights = root.render({ drawFunc: this.drawDeferredLights.bind(this), depth: true, width: W, height: H, bpp: 32 });
    var finalColor = lights;
    //var deferred = root.deferred({
    // width: W, height: H, bpp: 32,
    // albedoMap: color, normalMap: normals, depthMap: depth,
    // camera: this.camera,
    // lightPos: this.lights[0].position, lightBrightness: this.lightBrightness, lightColor: this.lights[0].uniforms.color, lightRadius: this.lightRadius,
    // occlusionMap: ssao,
    // roughness: this.roughness
    //});
    //finalColor = deferred;

    if (this.tonemapReinhard) finalColor = finalColor.tonemapReinhard({ width: W, height: H, bpp: 32, exposure: this.exposure });
    if (this.correctGamma) finalColor = finalColor.correctGamma({ width: W, height: H, bpp: 32 });
    finalColor = finalColor.contrast({ width: W, height: H, bpp: 32, contrast: this.contrast });

    var scale = Math.min(this.width / W, this.height / H);
    finalColor.blit({ x : (this.width - W * scale)/2, y: (this.height - H * scale)/2, width : W * scale, height: H * scale});
    //ssao.blit()

    this.gl.colorMask(0, 0, 0, 0);
    glu.enableDepthReadAndWrite(true);
    this.drawScene(this.solidColor); //just depth
    this.gl.colorMask(1, 1, 1, 1);

    this.lights[0].scale.set(1, 1, 1)
    this.lightMesh.drawInstances(this.camera, this.lights);

    //this.gl.writeImage('png', 'frame' + Time.frameNumber + '.png');

    //this.starMesh.rotation = Quat.fromAxisAngle(new Vec3(0, 1, 0), Time.seconds * 10)

    glu.viewport(0, 0, this.width, this.height);
    this.gui.draw();
  }
});

},{"./fx/Contrast":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/fx/Contrast.js","./fx/Deferred":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/fx/Deferred.js","./fx/SSAO":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/fx/SSAO.js","./materials/DeferredPointLight":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/materials/DeferredPointLight.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-fx":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/index.js","pex-gen":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js","pex-gui":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/index.js","pex-materials":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/index.js","pex-sys":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/fx/Contrast.js":[function(require,module,exports){
(function (__dirname){
var fx = require('pex-fx');
var FXStage = fx.FXStage;


var ContrastGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\nuniform sampler2D tex0;\nuniform float contrast;\n\nvoid main() {\n  vec4 color = texture2D(tex0, vTexCoord).rgba;\n  gl_FragColor.rgb = (color.rgb - 0.5) * contrast + 0.5;\n  gl_FragColor.a = color.a;\n}\n\n#endif";

FXStage.prototype.contrast = function (options) {
  options = options || { contrast: 1 };
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  rt.bind();
  this.getSourceTexture().bind(0);
  var program = this.getShader(ContrastGLSL);
  program.use();
  program.uniforms.tex0(0);
  program.uniforms.contrast(options.contrast);
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);
  rt.unbind();
  return this.asFXStage(rt, 'contrast');
};

module.exports = FXStage;
}).call(this,"/fx")
},{"pex-fx":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/fx/Deferred.js":[function(require,module,exports){
(function (__dirname){
var FXStage = require('pex-fx').FXStage;


var DeferredGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\nvarying vec2 vTexCoord;\n\nuniform mat4 viewMatrix;\n\nuniform vec3 lightPos;\nvarying vec3 ecLighPos;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n  ecLighPos = (viewMatrix * vec4(lightPos, 1.0)).xyz;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform mat4 invViewMatrix;\nuniform mat4 invProjectionMatrix;\n\nvarying vec3 ecLighPos;\nvarying vec2 vTexCoord;\nuniform sampler2D albedoMap;\nuniform sampler2D normalMap;\nuniform sampler2D depthMap;\nuniform sampler2D occlusionMap;\nuniform float lightBrightness;\nuniform float lightRadius;\nuniform vec4 lightColor;\n\nuniform float roughness;\n\nuniform float fov;\nuniform float near;\nuniform float far;\nuniform float aspectRatio;\n\nconst float PI = 3.14159265358979323846;\n\n//vec3 environmentMap(samplerCube envMap, in vec3 normalIn, in vec3 positionIn, float mipmapIndex) {\n//  vec3 E = normalize(positionIn); //eye dir\n//  vec3 R = reflect(E, normalIn); //reflecte vector\n//  R = vec3(invViewMatrix * vec4(R, 0.0));\n//  vec3 color = textureCubeLod(envMap, R, mipmapIndex).rgb;\n//  return color;\n//}\n\n//From Disney princlpled BRDF\nfloat SchlickFresnel(float u) {\n  float m = clamp(1.0-u, 0.0, 1.0);\n  float m2 = m*m;\n  return m2*m2*m; // pow(m,5)\n}\n\nvec3 Fresnel(vec3 specAlbedo, vec3 H, vec3 L) {\n  float LdotH = clamp(dot(L, H), 0.0, 1.0);\n  return specAlbedo + (1.0 - specAlbedo) * pow((1.0 - LdotH), 5.0);\n}\n\nvec3 getViewRay(vec2 tc) {\n  float hfar = 2.0 * tan(fov/2.0/180.0 * PI) * far;\n  float wfar = hfar * aspectRatio;\n  vec3 ray = (vec3(wfar * (tc.x - 0.5), hfar * (tc.y - 0.5), -far));\n  return ray;\n}\n\n//http://mynameismjp.wordpress.com/2010/09/05/position-from-depth-3/\n//assumes z = len(ecPos.xyz)\nvec3 reconstructPositionFromDepth(vec2 texCoord, float z) {\n  vec3 ray = getViewRay(texCoord);\n  return normalize(ray) * z;\n}\n\n//Problems more sharp metal doesn't get darker\n\nvoid main() {\n  vec3 normal = texture2D(normalMap, vTexCoord).rgb; //assumes rgb = ecNormal.xyz + 0.5\n  vec4 albedoValue = texture2D(albedoMap, vTexCoord);\n  vec3 albedoColor = pow(albedoValue.rgb, vec3(2.2));\n  vec3 specularColor = albedoColor; //for now\n  float depth = texture2D(depthMap, vTexCoord).a; //assumes a = len(ecPos.xyz)\n  float occlusion = texture2D(occlusionMap, vTexCoord).r;\n\n  vec3 position = reconstructPositionFromDepth(vTexCoord, texture2D(depthMap, vTexCoord).a);\n\n  vec3 FinalColor = vec3(0.0);\n  vec3 N = normalize(normal - 0.5);\n  vec3 L = normalize(ecLighPos - position.xyz);\n  vec3 V = normalize(-position.xyz);\n  vec3 H = normalize(L + V);\n\n  float NdotL = clamp(dot(N, L), 0.0, 1.0);\n  float NdotV = clamp(dot(N, V), 0.0, 1.0);\n  float LdotH = clamp(dot(L, H), 0.0, 1.0);\n  float NdotH = clamp(dot(N, H), 0.0, 1.0);\n  float VdotH = clamp(dot(V, H), 0.0, 1.0);\n\n  //albedoColor = vec3(0.2, 0.2, 0.2); //TEMP\n  //albedo = vec3(0.0); //TEMP\n  float lightDistance = length(ecLighPos - position.xyz);\n  float maxMipMapLevel = 6.0; //most blurry\n  vec3 F0 = specularColor;\n\n  if (lightDistance < lightRadius) {\n  }\n  else {\n  //  discard;\n  }\n\n  float metallic = 0.0;\n  //float roughness = 0.9; //0 - reflective, 1 - matte\n  float smoothness = 1.0 - roughness;    //0 - matte, 1 - reflective\n  float specular = 0.5;\n\n  /*\n\n  //indirect diffuse from IBL\n  vec3 envAmbient = environmentMap(reflectionMap, N, position, maxMipMapLevel);\n  envAmbient = pow(envAmbient, vec3(4.2)); //correct gamma TEMP: overexposed texture corrected\n\n  //indirect specular from IBL\n  vec3 envSpecular = environmentMap(reflectionMap, N, position, (1.0 - (1.0 - roughness) * (1.0 - roughness)) * maxMipMapLevel);\n  envSpecular = pow(envSpecular, vec3(4.2)); //correct gamma TEMP: overexposed texture corrected\n\n  */\n  //Based on \"Real Shading in Unreal Engine 4\"\n  float lightFalloff = pow(clamp(1.0 - pow(lightDistance/lightRadius, 4.0), 0.0, 1.0), 2.0) / (pow(lightDistance, 2.0) + 1.0);\n\n  /*\n  //Indirect diffuse\n  vec3 LIndirectDiffuse = mix(albedoColor, envSpecular, metallic) * envAmbient * (1.0 - metallic); //TODO: what's metal color?\n  */\n\n  //Diffuse Fresnel (Disney) aka glossy Fresnel\n  //Should be 2D lookup texture for IBL as in UnreadEngine4\n  float FL = SchlickFresnel(NdotL);\n  float FV = SchlickFresnel(NdotV);\n  float Fd90 = 0.5 + 2.0 * LdotH*LdotH * roughness;\n  float Fd = mix(1.0, Fd90, FL) * mix(1.0, Fd90, FV);\n\n  //Specular BRDF: Cook-Torrance microfacet model\n  //          D(h) * F(v,h) * G(l,v,h)\n  // f(l,v) = ------------------------\n  //              4 * n.l * n.v\n\n  //Alpha: Based on \"Real Shading in Unreal Engine 4\"\n  float a = pow(1.0 - smoothness * 0.7, 6.0);\n\n  //Normal Distribution Function: GGX\n  //                    a^2\n  //D(h) = --------------------------------\n  //       PI * ((n.h)^2 * (a^2 - 1) + 1)^2\n  float aSqr = a * a;\n  float Ddenom = NdotH * NdotH * (aSqr - 1.0) + 1.0;\n  float Dh = aSqr / ( PI * Ddenom * Ddenom);\n\n  //Fresnel Term: Fresnel schlick\n  //F(v,h) = F0 + (1 - F0)*(1 - (v.h))^5\n  //Linear interpolation between specular color F0 and white\n  vec3 Fvh = F0 + (1.0 - F0) * pow((1.0 - VdotH), 5.0);\n\n  /*\n  //Indirect specular\n  vec3 LIndirectSpecular = Fvh * specular * envSpecular * NdotL; //TODO: Fresnel * IBLspec(roughness)\n  */\n\n  //Visibility Term: Schlick-Smith\n  //                                          n.v               (0.8 + 0.5*a)^2\n  //G(l,v,h) = G1(l)* G1(v)    G1(v) = -----------------    k = ---------------\n  //                                   (n.v) * (1-k) + k               2\n  float k = pow(0.8 + 0.5 * a, 2.0) / 2.0;\n  float G1l = NdotL / (NdotL * (1.0 - k) + k);\n  float G1v = NdotV / (NdotV * (1.0 - k) + k);\n  float Glvn = G1l * G1v;\n\n  //Complete Cook-Torrance\n  vec3 flv = Dh * Fvh * Glvn / (4.0 * NdotL * NdotV);\n\n  //vec3 LDirectDiffuse = 1.0 / PI * albedoColor * (1.0 - metallic) * lightBrightness * lightColor * lightFalloff * clamp(NdotL, 0.0, 1.0);\n  vec3 LDirectDiffuse = 1.0 / PI * albedoColor * (1.0 - metallic) * lightBrightness * lightColor.rgb * lightFalloff * clamp(NdotL, 0.0, 1.0);\n  vec3 LDirectSpecualar = vec3(flv) * lightBrightness * lightColor.rgb * lightFalloff * clamp(NdotL, 0.0, 1.0);\n  /*\n\n  \n  FinalColor += LIndirectDiffuse * indirectDiffuseEnabled;\n  FinalColor += LIndirectSpecular * indirectSpecularEnabled;\n  FinalColor += LDirectDiffuse * directDiffuseEnabled;\n  FinalColor += LDirectSpecualar * directSpecularEnabled;\n  FinalColor = mix(FinalColor, FinalColor * vec3(occlusion), ssaoEnabled); //SSAO\n\n  if (fogEnabled > 0.0) {\n    //Fog\n    float LOG2 = 1.442695;\n    float fogFragCoord = 0;\n    float fogFactor;\n    if (-position.z < 5.0) {\n      fogFragCoord = max(0, length(position) - fogStart + fogOffset);\n      fogFactor = exp2(-fogForegroundDensity * fogForegroundDensity * fogFragCoord * fogFragCoord * LOG2);\n      fogFactor = clamp(fogFactor, 0.0, 1.0);\n      FinalColor = mix(fogColor.rgb, FinalColor, fogFactor);\n      //FinalColor = mix(vec3(0.0), FinalColor, fogFactor);\n    }\n    else {\n      fogFragCoord = max(0, length(position) - fogStart);\n      fogFactor = exp2(-fogDensity * fogDensity * fogFragCoord * fogFragCoord * LOG2);\n      fogFactor = clamp(fogFactor, 0.0, 1.0);\n      FinalColor = mix(fogColor.rgb, FinalColor, fogFactor);\n    }\n  }\n\n\n  \n\n  //FinalColor += vec3(fogFactor);\n\n  //FinalColor = vec3(metallic);\n\n  \n\n  //FinalColor = vec3(position.z/100.0);\n  //else FinalColor = vec3(occlusion);\n  //FinalColor *= fogFactor;\n  */\n\n  FinalColor = (LDirectDiffuse + LDirectSpecualar) * occlusion;\n\n  FinalColor.rgb = vec3(position.xy, 0.0);\n\n  gl_FragColor.rgb = FinalColor;\n}\n\n#endif";

FXStage.prototype.deferred = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  rt.bind();
  this.getSourceTexture(options.normalMap).bind(0);
  this.getSourceTexture(options.depthMap).bind(1);
  this.getSourceTexture(options.albedoMap).bind(2);
  this.getSourceTexture(options.occlusionMap).bind(3);
  var program = this.getShader(DeferredGLSL);
  program.use();
  program.uniforms.normalMap(0);
  program.uniforms.depthMap(1);
  program.uniforms.albedoMap(2);
  program.uniforms.occlusionMap(3);
  if (program.uniforms.near) program.uniforms.near(options.camera.getNear());
  if (program.uniforms.far) program.uniforms.far(options.camera.getFar());
  if (program.uniforms.fov) program.uniforms.fov(options.camera.getFov());
  if (program.uniforms.aspectRatio) program.uniforms.aspectRatio(options.camera.getAspectRatio());
  program.uniforms.viewMatrix(options.camera.getViewMatrix());
  if (program.uniforms.invViewMatrix) program.uniforms.invViewMatrix(options.camera.getViewMatrix().dup().invert());
  if (program.uniforms.invProjectionMatrix) program.uniforms.invProjectionMatrix(options.camera.getProjectionMatrix().dup().invert());
  program.uniforms.lightPos(options.lightPos);
  program.uniforms.lightColor(options.lightColor);
  program.uniforms.lightBrightness(options.lightBrightness);
  program.uniforms.lightRadius(options.lightRadius);
  program.uniforms.roughness(options.roughness);
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);
  rt.unbind();
  return this.asFXStage(rt, 'pbr');
};

module.exports = FXStage;
}).call(this,"/fx")
},{"pex-fx":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/fx/SSAO.js":[function(require,module,exports){
(function (__dirname){
var fx = require('pex-fx');
var FXStage = fx.FXStage;
var geom = require('pex-geom')
var Vec2 = geom.Vec2;


var SSAOGLSL = "//based on http://blenderartists.org/forum/showthread.php?184102-nicer-and-faster-SSAO and http://www.pasteall.org/12299\n#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\n\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\n#define PI    3.14159265\n\nvarying vec2 vTexCoord;\n\nuniform sampler2D depthMap;\nuniform vec2 textureSize;\nuniform float near;\nuniform float far;\n\nconst int samples = 3;\nconst int rings = 5;\n\nuniform float strength;\nuniform float cutoutBg;\n\nvec2 rand(vec2 coord) {\n  float noiseX = (fract(sin(dot(coord, vec2(12.9898,78.233))) * 43758.5453));\n  float noiseY = (fract(sin(dot(coord, vec2(12.9898,78.233) * 2.0)) * 43758.5453));\n  return vec2(noiseX,noiseY) * 0.004;\n}\n\nfloat compareDepths( in float depth1, in float depth2 )\n{\n  float aoCap = 1.0;\n  float aoMultiplier = 100.0;\n  float depthTolerance = 0.003;\n  float aorange = 5.0;// units in space the AO effect extends to (this gets divided by the camera far range\n  float diff = sqrt(clamp(1.0-(depth1-depth2) / (aorange/(far-near)),0.0,1.0));\n  float ao = min(aoCap, max(0.0, depth1-depth2-depthTolerance) * aoMultiplier) * diff;\n  //if (diff > depthTolerance * 500) return 0;\n  return ao * strength;\n}\n\nfloat readDepth(vec2 coord) {\n  return texture2D(depthMap, coord).a/far;\n}\n\nvoid main() {\n  vec2 texCoord = vec2(gl_FragCoord.x / textureSize.x, gl_FragCoord.y / textureSize.y);\n  float depth = readDepth(texCoord);\n\n  float d;\n\n  float aspect = textureSize.x / textureSize.y;\n  vec2 noise = rand(vTexCoord);\n\n  float w = (1.0 / textureSize.x)/clamp(depth,0.05,1.0)+(noise.x*(1.0-noise.x));\n  float h = (1.0 / textureSize.y)/clamp(depth,0.05,1.0)+(noise.y*(1.0-noise.y));\n\n  float pw;\n  float ph;\n\n  float ao = 0.0;\n  float s = 0.0;\n  float fade = 4.0;\n\n  for (int i = 0 ; i < rings; i += 1)\n  {\n    fade *= 0.5;\n    for (int j = 0 ; j < samples*rings; j += 1)\n    {\n      if (j >= samples*i) break;\n      float step = PI * 2.0 / (float(samples) * float(i));\n      pw = (cos(float(j)*step) * float(i) * 0.5);\n      ph = (sin(float(j)*step) * float(i) * 0.5) * aspect;\n      d = readDepth( vec2(texCoord.s + pw * w,texCoord.t + ph * h));\n      ao += compareDepths(depth, d) * fade;\n      s += 1.0 * fade;\n    }\n  }\n\n  ao /= s;\n  ao *= 1.5;\n  ao = 1.0 - ao;\n\n  if (depth > 0.99) ao += 0.5;\n\n  vec3 black = vec3(0.0, 0.0, 0.0);\n  vec3 treshold = vec3(0.2, 0.2, 0.2);\n\n  gl_FragColor = vec4(texCoord, 0.0, 1.0);\n  //gl_FragColor = vec4(getDepth(texCoord), 0.0, 0.0, 1.0);\n  gl_FragColor = vec4(ao, ao, ao, 1.0);\n\n  if (depth*cutoutBg > 0.5) gl_FragColor = vec4(0.0);\n}\n\n#endif";

FXStage.prototype.ssao = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  rt.bind();
  var depthMap = this.getSourceTexture(options.depthMap);
  depthMap.bind(0);
  var program = this.getShader(SSAOGLSL);
  program.use();
  program.uniforms.textureSize(Vec2.create(depthMap.width, depthMap.height));
  program.uniforms.depthMap(0);
  program.uniforms.near(options.camera.getNear());
  program.uniforms.far(options.camera.getFar());
  program.uniforms.strength(options.strength === null ? 1 : options.strength);
  program.uniforms.cutoutBg(options.cutoutBg ? 1 : 0);
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);
  rt.unbind();
  return this.asFXStage(rt, 'ssao');
};

module.exports = FXStage;
}).call(this,"/fx")
},{"pex-fx":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/materials/DeferredPointLight.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');

var Vec3 = geom.Vec3;

var DeferredPointLightGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\n\nattribute vec3 position;\nattribute vec2 texCoord;\n\nuniform mat4 viewMatrix;\n\nuniform vec3 lightPos;\n\nvarying vec3 ecLighPos;\nvarying vec2 vTexCoord;\nuniform float near;\n\nvoid main() {\n  vec3 pos = position;\n  vec4 ecPos = modelViewMatrix * vec4(pos, 1.0);\n  ecPos.z = min(ecPos.z, -near - 0.0001);\n  //ecPos.z = -5.0;\n  gl_Position = projectionMatrix * ecPos;\n  vTexCoord = gl_Position.xy/gl_Position.w * 0.5 + 0.5;\n  ecLighPos = (viewMatrix * vec4(lightPos, 1.0)).xyz;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform mat4 invViewMatrix;\nuniform mat4 invProjectionMatrix;\n\nvarying vec3 ecLighPos;\nvarying vec2 vTexCoord;\nuniform sampler2D albedoMap;\nuniform sampler2D normalMap;\nuniform sampler2D depthMap;\nuniform sampler2D occlusionMap;\nuniform float lightBrightness;\nuniform float lightRadius;\nuniform vec4 lightColor;\n\nuniform float roughness;\n\nuniform float fov;\nuniform float near;\nuniform float far;\nuniform float aspectRatio;\n\nconst float PI = 3.14159265358979323846;\n\n//vec3 environmentMap(samplerCube envMap, in vec3 normalIn, in vec3 positionIn, float mipmapIndex) {\n//  vec3 E = normalize(positionIn); //eye dir\n//  vec3 R = reflect(E, normalIn); //reflecte vector\n//  R = vec3(invViewMatrix * vec4(R, 0.0));\n//  vec3 color = textureCubeLod(envMap, R, mipmapIndex).rgb;\n//  return color;\n//}\n\n//From Disney princlpled BRDF\nfloat SchlickFresnel(float u) {\n  float m = clamp(1.0-u, 0.0, 1.0);\n  float m2 = m*m;\n  return m2*m2*m; // pow(m,5)\n}\n\nvec3 Fresnel(vec3 specAlbedo, vec3 H, vec3 L) {\n  float LdotH = clamp(dot(L, H), 0.0, 1.0);\n  return specAlbedo + (1.0 - specAlbedo) * pow((1.0 - LdotH), 5.0);\n}\n\nvec3 getViewRay(vec2 tc) {\n  float hfar = 2.0 * tan(fov/2.0/180.0 * PI) * far;\n  float wfar = hfar * aspectRatio;\n  vec3 ray = (vec3(wfar * (tc.x - 0.5), hfar * (tc.y - 0.5), -far));\n  return ray;\n}\n\n//http://mynameismjp.wordpress.com/2010/09/05/position-from-depth-3/\n//assumes z = len(ecPos.xyz)\nvec3 reconstructPositionFromDepth(vec2 texCoord, float z) {\n  vec3 ray = getViewRay(texCoord);\n  return normalize(ray) * z;\n}\n\n//Problems more sharp metal doesn't get darker\n\nvoid main() {\n  vec3 normal = texture2D(normalMap, vTexCoord).rgb; //assumes rgb = ecNormal.xyz + 0.5\n  vec4 albedoValue = texture2D(albedoMap, vTexCoord);\n  vec3 albedoColor = pow(albedoValue.rgb, vec3(2.2));\n  vec3 specularColor = albedoColor; //for now\n  float depth = texture2D(depthMap, vTexCoord).a; //assumes a = len(ecPos.xyz)\n  float occlusion = texture2D(occlusionMap, vTexCoord).r;\n\n  vec3 position = reconstructPositionFromDepth(vTexCoord, texture2D(depthMap, vTexCoord).a);\n\n  vec3 FinalColor = vec3(0.0);\n  vec3 N = normalize(normal - 0.5);\n  vec3 L = normalize(ecLighPos - position.xyz);\n  vec3 V = normalize(-position.xyz);\n  vec3 H = normalize(L + V);\n\n  float NdotL = clamp(dot(N, L), 0.0, 1.0);\n  float NdotV = clamp(dot(N, V), 0.0, 1.0);\n  float LdotH = clamp(dot(L, H), 0.0, 1.0);\n  float NdotH = clamp(dot(N, H), 0.0, 1.0);\n  float VdotH = clamp(dot(V, H), 0.0, 1.0);\n\n  //albedoColor = vec3(0.2, 0.2, 0.2); //TEMP\n  //albedo = vec3(0.0); //TEMP\n  float lightDistance = length(ecLighPos - position.xyz);\n  float maxMipMapLevel = 6.0; //most blurry\n  vec3 F0 = specularColor;\n\n  if (lightDistance < lightRadius) {\n  }\n  else {\n  //  discard;\n  }\n\n  float metallic = 0.0;\n  //float roughness = 0.9; //0 - reflective, 1 - matte\n  float smoothness = 1.0 - roughness;    //0 - matte, 1 - reflective\n  float specular = 0.5;\n\n  /*\n\n  //indirect diffuse from IBL\n  vec3 envAmbient = environmentMap(reflectionMap, N, position, maxMipMapLevel);\n  envAmbient = pow(envAmbient, vec3(4.2)); //correct gamma TEMP: overexposed texture corrected\n\n  //indirect specular from IBL\n  vec3 envSpecular = environmentMap(reflectionMap, N, position, (1.0 - (1.0 - roughness) * (1.0 - roughness)) * maxMipMapLevel);\n  envSpecular = pow(envSpecular, vec3(4.2)); //correct gamma TEMP: overexposed texture corrected\n\n  */\n  //Based on \"Real Shading in Unreal Engine 4\"\n  float lightFalloff = pow(clamp(1.0 - pow(lightDistance/lightRadius, 4.0), 0.0, 1.0), 2.0) / (pow(lightDistance, 2.0) + 1.0);\n\n  /*\n  //Indirect diffuse\n  vec3 LIndirectDiffuse = mix(albedoColor, envSpecular, metallic) * envAmbient * (1.0 - metallic); //TODO: what's metal color?\n  */\n\n  //Diffuse Fresnel (Disney) aka glossy Fresnel\n  //Should be 2D lookup texture for IBL as in UnreadEngine4\n  float FL = SchlickFresnel(NdotL);\n  float FV = SchlickFresnel(NdotV);\n  float Fd90 = 0.5 + 2.0 * LdotH*LdotH * roughness;\n  float Fd = mix(1.0, Fd90, FL) * mix(1.0, Fd90, FV);\n\n  //Specular BRDF: Cook-Torrance microfacet model\n  //          D(h) * F(v,h) * G(l,v,h)\n  // f(l,v) = ------------------------\n  //              4 * n.l * n.v\n\n  //Alpha: Based on \"Real Shading in Unreal Engine 4\"\n  float a = pow(1.0 - smoothness * 0.7, 6.0);\n\n  //Normal Distribution Function: GGX\n  //                    a^2\n  //D(h) = --------------------------------\n  //       PI * ((n.h)^2 * (a^2 - 1) + 1)^2\n  float aSqr = a * a;\n  float Ddenom = NdotH * NdotH * (aSqr - 1.0) + 1.0;\n  float Dh = aSqr / ( PI * Ddenom * Ddenom);\n\n  //Fresnel Term: Fresnel schlick\n  //F(v,h) = F0 + (1 - F0)*(1 - (v.h))^5\n  //Linear interpolation between specular color F0 and white\n  vec3 Fvh = F0 + (1.0 - F0) * pow((1.0 - VdotH), 5.0);\n\n  /*\n  //Indirect specular\n  vec3 LIndirectSpecular = Fvh * specular * envSpecular * NdotL; //TODO: Fresnel * IBLspec(roughness)\n  */\n\n  //Visibility Term: Schlick-Smith\n  //                                          n.v               (0.8 + 0.5*a)^2\n  //G(l,v,h) = G1(l)* G1(v)    G1(v) = -----------------    k = ---------------\n  //                                   (n.v) * (1-k) + k               2\n  float k = pow(0.8 + 0.5 * a, 2.0) / 2.0;\n  float G1l = NdotL / (NdotL * (1.0 - k) + k);\n  float G1v = NdotV / (NdotV * (1.0 - k) + k);\n  float Glvn = G1l * G1v;\n\n  //Complete Cook-Torrance\n  vec3 flv = Dh * Fvh * Glvn / (4.0 * NdotL * NdotV);\n\n  //vec3 LDirectDiffuse = 1.0 / PI * albedoColor * (1.0 - metallic) * lightBrightness * lightColor * lightFalloff * clamp(NdotL, 0.0, 1.0);\n  vec3 LDirectDiffuse = 1.0 / PI * albedoColor * (1.0 - metallic) * lightBrightness * lightColor.rgb * lightFalloff * clamp(NdotL, 0.0, 1.0);\n  vec3 LDirectSpecualar = vec3(flv) * lightBrightness * lightColor.rgb * lightFalloff * clamp(NdotL, 0.0, 1.0);\n  /*\n\n  \n  FinalColor += LIndirectDiffuse * indirectDiffuseEnabled;\n  FinalColor += LIndirectSpecular * indirectSpecularEnabled;\n  FinalColor += LDirectDiffuse * directDiffuseEnabled;\n  FinalColor += LDirectSpecualar * directSpecularEnabled;\n  FinalColor = mix(FinalColor, FinalColor * vec3(occlusion), ssaoEnabled); //SSAO\n\n  if (fogEnabled > 0.0) {\n    //Fog\n    float LOG2 = 1.442695;\n    float fogFragCoord = 0;\n    float fogFactor;\n    if (-position.z < 5.0) {\n      fogFragCoord = max(0, length(position) - fogStart + fogOffset);\n      fogFactor = exp2(-fogForegroundDensity * fogForegroundDensity * fogFragCoord * fogFragCoord * LOG2);\n      fogFactor = clamp(fogFactor, 0.0, 1.0);\n      FinalColor = mix(fogColor.rgb, FinalColor, fogFactor);\n      //FinalColor = mix(vec3(0.0), FinalColor, fogFactor);\n    }\n    else {\n      fogFragCoord = max(0, length(position) - fogStart);\n      fogFactor = exp2(-fogDensity * fogDensity * fogFragCoord * fogFragCoord * LOG2);\n      fogFactor = clamp(fogFactor, 0.0, 1.0);\n      FinalColor = mix(fogColor.rgb, FinalColor, fogFactor);\n    }\n  }\n\n\n  \n\n  //FinalColor += vec3(fogFactor);\n\n  //FinalColor = vec3(metallic);\n\n  \n\n  //FinalColor = vec3(position.z/100.0);\n  //else FinalColor = vec3(occlusion);\n  //FinalColor *= fogFactor;\n  */\n\n  //FinalColor = (LDirectDiffuse + LDirectSpecualar) * occlusion;\n  FinalColor = (LDirectDiffuse + LDirectSpecualar);\n\n  gl_FragColor.rgb = FinalColor;\n\n  //gl_FragColor.rgb = normal * 0.5 + 0.5;\n\n  //gl_FragColor.rgb = vec3(0.01, 0.0, 0.0);\n  //gl_FragColor.rgb += vec3(0.01,  lightFalloff, 0.0);\n\n  //gl_FragColor = vec4(lightDistance/lightRadius);\n  //gl_FragColor.rgb = vec3(position.x);\n  //gl_FragColor.a = 1.0;\n  //gl_FragColor = vec4(fract(vTexCoord*5.0), 0.0, 1.0);\n  //gl_FragColor.rgb = vec3(ecLighPos.y, 0.0, 0.0);\n  //gl_FragColor = vec4(occlusion/5.0);\n}\n\n#endif";

function DeferredPointLight(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(DeferredPointLightGLSL);
  var defaults = {
    albedoMap: null,
    normalMap: null,
    depthMap: null,
    occlusionMap: null,
    roughness: null,
    camera: null,
    lightPos: new Vec3(0, 0, 0),
    lightBrightness: 1,
    lightColor: Color.White,
    lightRadius: 1
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

DeferredPointLight.prototype = Object.create(Material.prototype);

module.exports = DeferredPointLight;

}).call(this,"/materials")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/lib/_empty.js":[function(require,module,exports){

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/node_modules/path-browserify/index.js":[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/node_modules/process/browser.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/node_modules/process/browser.js":[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/merge/merge.js":[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.1.3
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	function merge() {

		var items = Array.prototype.slice.call(arguments),
			result = items.shift(),
			deep = (result === true),
			size = items.length,
			item, index, key;

		if (deep || typeOf(result) !== 'object')

			result = {};

		for (index=0;index<size;++index)

			if (typeOf(item = items[index]) === 'object')

				for (key in item)

					result[key] = deep ? clone(item[key]) : item[key];

		return result;

	}

	function clone(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = clone(input[index]);

		}

		return output;

	}

	function typeOf(input) {

		return ({}).toString.call(input).match(/\s([\w]+)/)[1].toLowerCase();

	}

	if (isNode) {

		module.exports = merge;

	} else {

		window.merge = merge;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js":[function(require,module,exports){
module.exports.Color = require('./lib/Color');
},{"./lib/Color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/lib/Color.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/lib/Color.js":[function(require,module,exports){
var clamp = function(value, min, max) {
  return Math.max(min, Math.min(value, max));
};

var lerp = function(a, b, t) {
  return a + (b - a) * t;
};

function Color(r, g, b, a) {
  this.r = (r != null) ? r : 0;
  this.g = (g != null) ? g : 0;
  this.b = (b != null) ? b : 0;
  this.a = (a != null) ? a : 1;
}

Color.create = function(r, g, b, a) {
  return new Color(r, g, b, a);
};

Color.fromRGB = Color.create;

Color.fromHSV = function(h, s, v, a) {
  var c = new Color();
  c.setHSV(h, s, v, a);
  return c;
};

Color.fromHSL = function(h, s, l, a) {
  var c = new Color();
  c.setHSL(h, s, l, a);
  return c;
};

Color.prototype.set = function(r, g, b, a) {
  this.r = r;
  this.g = g;
  this.b = b;
  this.a = (a != null) ? a : 1;

  return this;
};

Color.prototype.hash = function() {
  return 1 * this.r + 12 * this.g + 123 * this.b + 1234 * this.a;
};

Color.prototype.setHSV = function(h, s, v, a) {
  a = (a != null) ? a : 1;

  var i = Math.floor(h * 6);
  var f = h * 6 - i;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: this.r = v, this.g = t, this.b = p; break;
    case 1: this.r = q, this.g = v, this.b = p; break;
    case 2: this.r = p, this.g = v, this.b = t; break;
    case 3: this.r = p, this.g = q, this.b = v; break;
    case 4: this.r = t, this.g = p, this.b = v; break;
    case 5: this.r = v, this.g = p, this.b = q; break;
  }

  this.a = a;
  return this;
};

Color.prototype.getHSV = function() {
  var r = this.r;
  var g = this.g;
  var b = this.b;
  var max = Math.max(r, g, b)
  var min = Math.min(r, g, b);
  var h;
  var v = max;
  var d = max - min;
  var s = max == 0 ? 0 : d / max;

  if (max == min) {
    h = 0; // achromatic
  }
  else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: h, s: s, v: v, a: this.a };
}

//h 0..1
//s 0..1
//l 0..1
//a 0..1
//https://gist.github.com/mjijackson/5311256
Color.prototype.setHSL = function(h, s, l, a) {
  a = (a != null) ? a : 1;

  if (s == 0) {
    this.r = this.g = this.b = l; // achromatic
  }
  else {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;

    this.r = hue2rgb(p, q, h + 1/3);
    this.g = hue2rgb(p, q, h);
    this.b = hue2rgb(p, q, h - 1/3);
    this.a = a;
  }
};

//https://gist.github.com/mjijackson/5311256
Color.prototype.getHSL = function() {
  var r = this.r;
  var g = this.g;
  var b = this.b;
  var max = Math.max(r, g, b)
  var min = Math.min(r, g, b);
  var l = (max + min) / 2;
  var h;
  var s;

  if (max == min) {
    h = s = 0; // achromatic
  }
  else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }

    h /= 6;
  }

  return { h: h, s: s, l: l, a: this.a };
};

Color.prototype.copy = function(c) {
  this.r = c.r;
  this.g = c.g;
  this.b = c.b;
  this.a = c.a;

  return this;
};

Color.prototype.clone = function(c) {
  return new Color(this.r, this.g, this.b, this.a);
};

Color.lerp = function(startColor, endColor, t, mode) {
  mode = mode || 'rgb';

  if (mode == 'rgb') {
    return Color.fromRGB(
      lerp(startColor.r, endColor.r, t),
      lerp(startColor.g, endColor.g, t),
      lerp(startColor.b, endColor.b, t),
      lerp(startColor.a, endColor.a, t)
    )
  }
  else if (mode == 'hsv') {
    var startHSV = startColor.getHSV();
    var endHSV = endColor.getHSV();
    return Color.fromHSV(
      lerp(startHSV.h, endHSV.h, t),
      lerp(startHSV.s, endHSV.s, t),
      lerp(startHSV.v, endHSV.v, t),
      lerp(startHSV.a, endHSV.a, t)
    )
  }
  else if (mode == 'hsl') {
    var startHSL = startColor.getHSL();
    var endHSL = endColor.getHSL();
    return Color.fromHSL(
      lerp(startHSL.h, endHSL.h, t),
      lerp(startHSL.s, endHSL.s, t),
      lerp(startHSL.l, endHSL.l, t),
      lerp(startHSL.a, endHSL.a, t)
    )
  }
  else {
    return startColor;
  }
};

Color.Transparent = new Color(0, 0, 0, 0);
Color.None = new Color(0, 0, 0, 0);
Color.Black = new Color(0, 0, 0, 1);
Color.White = new Color(1, 1, 1, 1);
Color.DarkGrey = new Color(0.25, 0.25, 0.25, 1);
Color.Grey = new Color(0.5, 0.5, 0.5, 1);
Color.Red = new Color(1, 0, 0, 1);
Color.Green = new Color(0, 1, 0, 1);
Color.Blue = new Color(0, 0, 1, 1);
Color.Yellow = new Color(1, 1, 0, 1);
Color.Pink = new Color(1, 0, 1, 1);
Color.Cyan = new Color(0, 1, 1, 1);
Color.Orange = new Color(1, 0.5, 0, 1);

module.exports = Color;

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/index.js":[function(require,module,exports){
var FXStage = require('./lib/FXStage');
require('./lib/Render');
require('./lib/Blit');
require('./lib/Add');
require('./lib/Blur3');
require('./lib/Blur5');
require('./lib/Downsample2');
require('./lib/Downsample4');
require('./lib/FXAA');
require('./lib/CorrectGamma');
require('./lib/TonemapReinhard');

var globalFx;

module.exports = function() {
  if (!globalFx) {
    globalFx = new FXStage();
  }
  globalFx.reset();
  return globalFx;
};

module.exports.FXStage = FXStage;
},{"./lib/Add":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Add.js","./lib/Blit":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Blit.js","./lib/Blur3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Blur3.js","./lib/Blur5":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Blur5.js","./lib/CorrectGamma":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/CorrectGamma.js","./lib/Downsample2":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Downsample2.js","./lib/Downsample4":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Downsample4.js","./lib/FXAA":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXAA.js","./lib/FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js","./lib/Render":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Render.js","./lib/TonemapReinhard":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/TonemapReinhard.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Add.js":[function(require,module,exports){
(function (__dirname){
var FXStage = require('./FXStage');


var AddGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\nuniform sampler2D tex0;\nuniform sampler2D tex1;\nuniform float scale;\n\nvoid main() {\n  vec4 color = texture2D(tex0, vTexCoord).rgba;\n  vec4 color2 = texture2D(tex1, vTexCoord).rgba;\n\n  //color += scale * color2 * color2.a;\n\n  gl_FragColor = 1.0 - (1.0 - color) * (1.0 - color2 * scale);\n\n  //gl_FragColor.rgba = color + scale * color2;\n  //gl_FragColor.a = 1.0;\n}\n\n#endif";

FXStage.prototype.add = function (source2, options) {
  options = options || {};
  scale = options.scale !== undefined ? options.scale : 1;
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  rt.bind();
  this.getSourceTexture().bind(0);
  this.getSourceTexture(source2).bind(1);
  var program = this.getShader(AddGLSL);
  program.use();
  program.uniforms.tex0(0);
  program.uniforms.tex1(1);
  program.uniforms.scale(scale);
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);
  rt.unbind();
  return this.asFXStage(rt, 'add');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Blit.js":[function(require,module,exports){
var FXStage = require('./FXStage');

FXStage.prototype.blit = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  var x = options.x || 0;
  var y = options.y || 0;
  this.drawFullScreenQuadAt(x, y, outputSize.width, outputSize.height, this.getSourceTexture());
  return this;
};

module.exports = FXStage;
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Blur3.js":[function(require,module,exports){
(function (__dirname){
var geom  = require('pex-geom');
var Vec2 = geom.Vec2;
var FXStage = require('./FXStage');


var Blur3HGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\n\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\n\nuniform sampler2D image;\nuniform vec2 imageSize;\n\nvoid main() {\n  vec2 texel = vec2(1.0 / imageSize.x, 1.0 / imageSize.y);\n\n  vec4 color = vec4(0.0);\n  color += 0.25 * texture2D(image, vTexCoord + vec2(texel.x * -1.0, 0.0));\n  color += 0.50 * texture2D(image, vTexCoord);\n  color += 0.25 * texture2D(image, vTexCoord + vec2(texel.x *  1.0, 0.0));\n  gl_FragColor = color;\n}\n\n#endif\n";
var Blur3VGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\n\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\n\nuniform sampler2D image;\nuniform vec2 imageSize;\n\nvoid main() {\n  vec2 texel = vec2(1.0 / imageSize.x, 1.0 / imageSize.y);\n\n  vec4 color = vec4(0.0);\n  color += 0.25 * texture2D(image, vTexCoord + vec2(0.0, texel.y * -1.0));\n  color += 0.50 * texture2D(image, vTexCoord);\n  color += 0.25 * texture2D(image, vTexCoord + vec2(0.0, texel.y *  1.0));\n  gl_FragColor = color;\n}\n\n#endif\n";

FXStage.prototype.blur3 = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  var rth = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  var rtv = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  var source = this.getSourceTexture();
  var programH = this.getShader(Blur3HGLSL);
  programH.use();
  programH.uniforms.imageSize(Vec2.create(source.width, source.height));
  rth.bindAndClear();
  this.drawFullScreenQuad(outputSize.width, outputSize.height, source, programH);
  rth.unbind();
  var programV = this.getShader(Blur3VGLSL);
  programV.use();
  programV.uniforms.imageSize(Vec2.create(source.width, source.height));
  rtv.bindAndClear();
  this.drawFullScreenQuad(outputSize.width, outputSize.height, rth.getColorAttachement(0), programV);
  rtv.unbind();
  return this.asFXStage(rtv, 'blur3');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Blur5.js":[function(require,module,exports){
(function (__dirname){
var geom  = require('pex-geom');
var Vec2 = geom.Vec2;
var FXStage = require('./FXStage');


var Blur5HGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\n\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\n\nuniform sampler2D image;\nuniform vec2 imageSize;\n\nvoid main() {\n  vec2 texel = vec2(1.0 / imageSize.x, 1.0 / imageSize.y);\n\n  vec4 color = vec4(0.0);\n  color += 1.0/16.0 * texture2D(image, vTexCoord + vec2(texel.x * -2.0, 0.0));\n  color += 4.0/16.0 * texture2D(image, vTexCoord + vec2(texel.x * -1.0, 0.0));\n  color += 6.0/16.0 * texture2D(image, vTexCoord + vec2(texel.x *  0.0, 0.0));\n  color += 4.0/16.0 * texture2D(image, vTexCoord + vec2(texel.x *  1.0, 0.0));\n  color += 1.0/16.0 * texture2D(image, vTexCoord + vec2(texel.x *  2.0, 0.0));\n  gl_FragColor = color;\n}\n\n#endif\n";
var Blur5VGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\n\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\n\nuniform sampler2D image;\nuniform vec2 imageSize;\n\nvoid main() {\n  vec2 texel = vec2(1.0 / imageSize.x, 1.0 / imageSize.y);\n\n  vec4 color = vec4(0.0);\n  color += 1.0/16.0 * texture2D(image, vTexCoord + vec2(0.0, texel.y * -2.0));\n  color += 4.0/16.0 * texture2D(image, vTexCoord + vec2(0.0, texel.y * -1.0));\n  color += 6.0/16.0 * texture2D(image, vTexCoord + vec2(0.0, texel.y *  0.0));\n  color += 4.0/16.0 * texture2D(image, vTexCoord + vec2(0.0, texel.y *  1.0));\n  color += 1.0/16.0 * texture2D(image, vTexCoord + vec2(0.0, texel.y *  2.0));\n  gl_FragColor = color;\n}\n\n#endif\n";

FXStage.prototype.blur5 = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  var rth = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  var rtv = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  var source = this.getSourceTexture();
  var programH = this.getShader(Blur5HGLSL);
  programH.use();
  programH.uniforms.imageSize(Vec2.create(source.width, source.height));
  rth.bindAndClear();
  this.drawFullScreenQuad(outputSize.width, outputSize.height, source, programH);
  rth.unbind();
  var programV = this.getShader(Blur5VGLSL);
  programV.use();
  programV.uniforms.imageSize(Vec2.create(source.width, source.height));
  rtv.bindAndClear();
  this.drawFullScreenQuad(outputSize.width, outputSize.height, rth.getColorAttachement(0), programV);
  rtv.unbind();
  return this.asFXStage(rtv, 'blur5');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/CorrectGamma.js":[function(require,module,exports){
(function (__dirname){
var FXStage = require('./FXStage');


var CorrectGammaGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\nuniform sampler2D tex0;\n\nvoid main() {\n  vec4 color = texture2D(tex0, vTexCoord).rgba;\n  vec3 retColor = pow(color.rgb, vec3(1.0/2.2)); //map gamma\n  gl_FragColor.rgb = retColor;\n  gl_FragColor.a = 1.0;\n}\n\n#endif";

FXStage.prototype.correctGamma = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  rt.bind();
  this.getSourceTexture().bind(0);
  var program = this.getShader(CorrectGammaGLSL);
  program.use();
  program.uniforms.tex0(0);
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);
  rt.unbind();
  return this.asFXStage(rt, 'correctGamma');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Downsample2.js":[function(require,module,exports){
(function (__dirname){
var geom  = require('pex-geom');
var Vec2 = geom.Vec2;
var FXStage = require('./FXStage');


var Downsample2GLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\n\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\n\nuniform sampler2D image;\nuniform vec2 imageSize;\n\nvoid main() {\n  vec2 texel = vec2(1.0 / imageSize.x, 1.0 / imageSize.y);\n  vec4 color = vec4(0.0);\n  color += texture2D(image, vTexCoord + vec2(texel.x * -1.0, texel.y * -1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  0.0, texel.y * -1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -1.0, texel.y *  0.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  0.0, texel.y *  0.0));\n  gl_FragColor = color / 4.0;\n}\n\n#endif";

FXStage.prototype.downsample2 = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  outputSize.width /= 2;
  outputSize.height /= 2;
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  var source = this.getSourceTexture();
  var program = this.getShader(Downsample2GLSL);
  program.use();
  program.uniforms.imageSize(Vec2.create(source.width, source.height));
  rt.bindAndClear();
  this.drawFullScreenQuad(outputSize.width, outputSize.height, source, program);
  rt.unbind();
  return this.asFXStage(rt, 'downsample2');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Downsample4.js":[function(require,module,exports){
(function (__dirname){
var geom  = require('pex-geom');
var Vec2 = geom.Vec2;
var FXStage = require('./FXStage');


var Downsample4GLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\n\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\n\nuniform sampler2D image;\nuniform vec2 imageSize;\n\nvoid main() {\n  vec2 texel = vec2(1.0 / imageSize.x, 1.0 / imageSize.y);\n  vec4 color = vec4(0.0);\n  color += texture2D(image, vTexCoord + vec2(texel.x * -2.0, texel.y * -2.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -1.0, texel.y * -2.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  0.0, texel.y * -2.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  1.0, texel.y * -2.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -2.0, texel.y * -1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -1.0, texel.y * -1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  0.0, texel.y * -1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  1.0, texel.y * -1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -2.0, texel.y *  0.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -1.0, texel.y *  0.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  0.0, texel.y *  0.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  1.0, texel.y *  0.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -2.0, texel.y *  1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x * -1.0, texel.y *  1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  0.0, texel.y *  1.0));\n  color += texture2D(image, vTexCoord + vec2(texel.x *  1.0, texel.y *  1.0));\n  gl_FragColor = color / 16.0;\n}\n\n#endif";

FXStage.prototype.downsample4 = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height, true);
  outputSize.width /= 4;
  outputSize.height /= 4;
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  var source = this.getSourceTexture();
  var program = this.getShader(Downsample4GLSL);
  program.use();
  program.uniforms.imageSize(Vec2.create(source.width, source.height));
  rt.bindAndClear();
  this.drawFullScreenQuad(outputSize.width, outputSize.height, source, program);
  rt.unbind();
  return this.asFXStage(rt, 'downsample4');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXAA.js":[function(require,module,exports){
(function (__dirname){
var geom  = require('pex-geom');
var FXStage = require('./FXStage');


var FXAAGLSL = "#ifdef VERT\n\nfloat FXAA_SUBPIX_SHIFT = 1.0/4.0;\n\nuniform float rtWidth;\nuniform float rtHeight;\nattribute vec2 position;\nattribute vec2 texCoord;\nvarying vec4 posPos;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n\n  vec2 rcpFrame = vec2(1.0/rtWidth, 1.0/rtHeight);\n  posPos.xy = texCoord.xy;\n  posPos.zw = texCoord.xy - (rcpFrame * (0.5 + FXAA_SUBPIX_SHIFT));\n}\n\n#endif\n\n#ifdef FRAG\n\n#define FXAA_REDUCE_MIN   (1.0/ 128.0)\n#define FXAA_REDUCE_MUL   (1.0 / 8.0)\n#define FXAA_SPAN_MAX     8.0\n\nuniform sampler2D tex0;\nvarying vec4 posPos;\nuniform float rtWidth;\nuniform float rtHeight;\n\n\nvec4 applyFXAA(vec2 fragCoord, sampler2D tex)\n{\n    vec4 color;\n    vec2 inverseVP = vec2(1.0 / rtWidth, 1.0 / rtHeight);\n    vec3 rgbNW = texture2D(tex, (fragCoord + vec2(-1.0, -1.0)) * inverseVP).xyz;\n    vec3 rgbNE = texture2D(tex, (fragCoord + vec2(1.0, -1.0)) * inverseVP).xyz;\n    vec3 rgbSW = texture2D(tex, (fragCoord + vec2(-1.0, 1.0)) * inverseVP).xyz;\n    vec3 rgbSE = texture2D(tex, (fragCoord + vec2(1.0, 1.0)) * inverseVP).xyz;\n    vec3 rgbM  = texture2D(tex, fragCoord  * inverseVP).xyz;\n    vec3 luma = vec3(0.299, 0.587, 0.114);\n    float lumaNW = dot(rgbNW, luma);\n    float lumaNE = dot(rgbNE, luma);\n    float lumaSW = dot(rgbSW, luma);\n    float lumaSE = dot(rgbSE, luma);\n    float lumaM  = dot(rgbM,  luma);\n    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));\n    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));\n\n    //return texture2D(tex, fragCoord);\n    //return vec4(fragCoord, 0.0, 1.0);\n    //return vec4(rgbM, 1.0);\n\n    vec2 dir;\n    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));\n    dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));\n\n    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) *\n                          (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);\n\n    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);\n    dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),\n              max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),\n              dir * rcpDirMin)) * inverseVP;\n\n    vec3 rgbA = 0.5 * (\n        texture2D(tex, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz +\n        texture2D(tex, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);\n    vec3 rgbB = rgbA * 0.5 + 0.25 * (\n        texture2D(tex, fragCoord * inverseVP + dir * -0.5).xyz +\n        texture2D(tex, fragCoord * inverseVP + dir * 0.5).xyz);\n\n    float lumaB = dot(rgbB, luma);\n    if ((lumaB < lumaMin) || (lumaB > lumaMax))\n        color = vec4(rgbA, 1.0);\n    else\n        color = vec4(rgbB, 1.0);\n    return color;\n}\n\nvoid main() {\n  gl_FragColor = applyFXAA(posPos.xy * vec2(rtWidth, rtHeight), tex0);\n}\n\n//#version 120\n/*\nuniform sampler2D tex0;\nvarying vec4 posPos;\nuniform float rtWidth;\nuniform float rtHeight;\nfloat FXAA_SPAN_MAX = 8.0;\nfloat FXAA_REDUCE_MUL = 1.0/8.0;\n\n#define FxaaInt2 ivec2\n#define FxaaFloat2 vec2\n#define FxaaTexLod0(t, p) texture2DLod(t, p, 0.0)\n#define FxaaTexOff(t, p, o, r) texture2DLodOffset(t, p, 0.0, o)\n\nvec3 FxaaPixelShader(\n  vec4 posPos, // Output of FxaaVertexShader interpolated across screen.\n  sampler2D tex, // Input texture.\n  vec2 rcpFrame) // Constant {1.0/frameWidth, 1.0/frameHeight}.\n{\n//---------------------------------------------------------\n    #define FXAA_REDUCE_MIN   (1.0/128.0)\n    //#define FXAA_REDUCE_MUL   (1.0/8.0)\n    //#define FXAA_SPAN_MAX     8.0\n//---------------------------------------------------------\n    vec3 rgbNW = FxaaTexLod0(tex, posPos.zw).xyz;\n    vec3 rgbNE = FxaaTexOff(tex, posPos.zw, FxaaInt2(1,0), rcpFrame.xy).xyz;\n    vec3 rgbSW = FxaaTexOff(tex, posPos.zw, FxaaInt2(0,1), rcpFrame.xy).xyz;\n    vec3 rgbSE = FxaaTexOff(tex, posPos.zw, FxaaInt2(1,1), rcpFrame.xy).xyz;\n    vec3 rgbM  = FxaaTexLod0(tex, posPos.xy).xyz;\n//---------------------------------------------------------\n    vec3 luma = vec3(0.299, 0.587, 0.114);\n    float lumaNW = dot(rgbNW, luma);\n    float lumaNE = dot(rgbNE, luma);\n    float lumaSW = dot(rgbSW, luma);\n    float lumaSE = dot(rgbSE, luma);\n    float lumaM  = dot(rgbM,  luma);\n/*---------------------------------------------------------\n    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));\n    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));\n/*---------------------------------------------------------\n    vec2 dir;\n    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));\n    dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));\n/*---------------------------------------------------------\n    float dirReduce = max(\n        (lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL),\n        FXAA_REDUCE_MIN);\n    float rcpDirMin = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);\n    dir = min(FxaaFloat2( FXAA_SPAN_MAX,  FXAA_SPAN_MAX),\n          max(FxaaFloat2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),\n          dir * rcpDirMin)) * rcpFrame.xy;\n/*--------------------------------------------------------\n    vec3 rgbA = (1.0/2.0) * (\n        FxaaTexLod0(tex, posPos.xy + dir * (1.0/3.0 - 0.5)).xyz +\n        FxaaTexLod0(tex, posPos.xy + dir * (2.0/3.0 - 0.5)).xyz);\n    vec3 rgbB = rgbA * (1.0/2.0) + (1.0/4.0) * (\n        FxaaTexLod0(tex, posPos.xy + dir * (0.0/3.0 - 0.5)).xyz +\n        FxaaTexLod0(tex, posPos.xy + dir * (3.0/3.0 - 0.5)).xyz);\n    float lumaB = dot(rgbB, luma);\n    if((lumaB < lumaMin) || (lumaB > lumaMax)) return rgbA;\n    return rgbB; }\n\nvec4 PostFX(sampler2D tex, vec2 uv, float time)\n{\n  vec4 c = vec4(0.0);\n  vec2 rcpFrame = vec2(1.0/rt_w, 1.0/rt_h);\n  c.rgb = FxaaPixelShader(posPos, tex, rcpFrame);\n  //c.rgb = 1.0 - texture2D(tex, posPos.xy).rgb;\n  c.a = 1.0;\n  return c;\n}\n\nvoid main()\n{\n  vec2 uv = posPos.xy;\n  gl_FragColor = PostFX(tex0, uv, 0.0);\n}\n\n*/\n\n#endif";

FXStage.prototype.fxaa = function (options) {
  options = options || {};
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  rt.bind();
  var source = this.getSourceTexture();
  source.bind();
  var program = this.getShader(FXAAGLSL);
  program.use();
  program.uniforms.rtWidth(source.width);
  program.uniforms.rtHeight(source.height);
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);
  rt.unbind();
  return this.asFXStage(rt, 'fxaa');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXResourceMgr.js":[function(require,module,exports){
function FXResourceMgr() {
  this.cache = [];
}

FXResourceMgr.prototype.getResource = function(type, properties) {
  properties = properties || {};
  for (var i = 0; i < this.cache.length; i++) {
    var res = this.cache[i];
    if (res.type == type && !res.used) {
      var areTheSame = true;
      for (var propName in properties) {
        if (properties[propName] != res.properties[propName]) {
          areTheSame = false;
        }
      }
      if (areTheSame)
        return res;
    }
  }
  return null;
};

FXResourceMgr.prototype.addResource = function(type, obj, properties) {
  var res = {
    type: type,
    obj: obj,
    properties: properties
  };
  this.cache.push(res);
  return res;
};

FXResourceMgr.prototype.markAllAsNotUsed = function() {
  for (var i = 0; i < this.cache.length; i++) {
    this.cache[i].used = false;
  }
};

module.exports = FXResourceMgr;
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js":[function(require,module,exports){
var glu = require('pex-glu');
var Context = glu.Context;
var ScreenImage = glu.ScreenImage;
var RenderTarget = glu.RenderTarget;
var Program = glu.Program;
var Texture2D = glu.Texture2D;
var FXResourceMgr = require('./FXResourceMgr');

var FXStageCount = 0;

function FXStage(source, resourceMgr, fullscreenQuad) {
  this.id = FXStageCount++;
  console.log('FXStage+ ' + FXStageCount);
  this.gl = Context.currentContext;
  this.source = source || null;
  this.resourceMgr = resourceMgr || new FXResourceMgr();
  this.fullscreenQuad = fullscreenQuad || new ScreenImage();
  this.defaultBPP = 8;
}

FXStage.prototype.reset = function() {
  this.resourceMgr.markAllAsNotUsed();
};

FXStage.prototype.getOutputSize = function(width, height, verbose) {
  if (width && height) {
    return {
      width: width,
      height: height
    };
  }
  else if (this.source) {
    return {
      width: this.source.width,
      height: this.source.height
    };
  }
  else {
    //var viewport = this.gl.getParameter(this.gl.VIEWPORT);
    return {
      width: 1024,//viewport[2],
      height: 768,//viewport[3]
    };
  }
};

FXStage.prototype.getRenderTarget = function(w, h, depth, bpp) {
  depth = depth || false;
  bpp = bpp || this.defaultBPP;
  var resProps = {
    w: w,
    h: h,
    depth: depth,
    bpp: bpp
  };
  var res = this.resourceMgr.getResource('RenderTarget', resProps);
  if (!res) {
    var renderTarget = new RenderTarget(w, h, resProps);
    res = this.resourceMgr.addResource('RenderTarget', renderTarget, resProps);
  }
  res.used = true;
  return res.obj;
};

FXStage.prototype.getFXStage = function(name) {
  var resProps = {};
  var res = this.resourceMgr.getResource('FXStage', resProps);
  if (!res) {
    var fxState = new FXStage(null, this.resourceMgr, this.fullscreenQuad);
    res = this.resourceMgr.addResource('FXStage', fxState, resProps);
  }
  res.used = true;
  return res.obj;
};

FXStage.prototype.asFXStage = function(source, name) {
  var stage = this.getFXStage(name);
  stage.source = source;
  stage.name = name + '_' + stage.id;
  return stage;
};

FXStage.prototype.getShader = function(code) {
  if (code.indexOf('.glsl') == code.length - 5) {
    throw 'FXStage.getShader - loading files not supported yet.';
  }
  var resProps = { code: code };
  var res = this.resourceMgr.getResource('Program', resProps);
  if (!res) {
    var program = new Program(code);
    res = this.resourceMgr.addResource('Program', program, resProps);
  }
  res.used = true;
  return res.obj;
};

FXStage.prototype.getSourceTexture = function(source) {
  if (source) {
    if (source.source) {
      if (source.source.getColorAttachement) {
        return source.source.getColorAttachement(0);
      }
      else return source.source;
    }
    else if (source.getColorAttachement) {
      return source.getColorAttachement(0);
    }
    else return source;
  }
  else if (this.source) {
    if (this.source.getColorAttachement) {
      return this.source.getColorAttachement(0);
    }
    else return this.source;
  }
  else throw 'FXStage.getSourceTexture() No source texture!';
};

FXStage.prototype.drawFullScreenQuad = function(width, height, image, program) {
  this.drawFullScreenQuadAt(0, 0, width, height, image, program);
};

FXStage.prototype.drawFullScreenQuadAt = function(x, y, width, height, image, program) {
  var gl = this.gl;
  gl.disable(gl.DEPTH_TEST);
  //var oldViewport = gl.getParameter(gl.VIEWPORT);
  gl.viewport(x, y, width, height);
  this.fullscreenQuad.draw(image, program);
  //gl.viewport(oldViewport[0], oldViewport[1], oldViewport[2], oldViewport[3]);
};

FXStage.prototype.getImage = function(path) {
  var resProps = { path: path };
  var res = this.resourceMgr.getResource('Image', resProps);
  if (!res) {
    var image = Texture2D.load(path);
    res = this.resourceMgr.addResource('Image', image, resProps);
  }
  res.used = false;
  //can be shared so no need for locking
  return res.obj;
};

FXStage.prototype.getFullScreenQuad = function() {
  return this.fullscreenQuad;
};

module.exports = FXStage;
},{"./FXResourceMgr":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXResourceMgr.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/Render.js":[function(require,module,exports){
var FXStage = require('./FXStage');

FXStage.prototype.render = function (options) {
  var gl = this.gl;
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  //var oldViewport = gl.getParameter(gl.VIEWPORT);
  gl.viewport(0, 0, outputSize.width, outputSize.height);
  rt.bindAndClear();
  if (options.drawFunc) {
    options.drawFunc();
  }
  rt.unbind();
  //gl.viewport(oldViewport[0], oldViewport[1], oldViewport[2], oldViewport[3]);
  return this.asFXStage(rt, 'render');
};

},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/TonemapReinhard.js":[function(require,module,exports){
(function (__dirname){
var FXStage = require('./FXStage');


var TonemapReinhardGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = vec4(position, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\nuniform float exposure;\nuniform sampler2D tex0;\n\nvoid main() {\n  vec4 color = texture2D(tex0, vTexCoord).rgba;\n  color.rgb *= exposure;\n  color = color/(1.0 + color);\n  vec3 retColor = color.rgb;\n  gl_FragColor.rgb = retColor;\n  gl_FragColor.a = color.a;\n}\n\n#endif";

FXStage.prototype.tonemapReinhard = function (options) {
  options = options || {
    exposure: 1
  };
  var outputSize = this.getOutputSize(options.width, options.height);
  var rt = this.getRenderTarget(outputSize.width, outputSize.height, options.depth, options.bpp);
  rt.bind();
  this.getSourceTexture().bind(0);
  var program = this.getShader(TonemapReinhardGLSL);
  program.use();
  program.uniforms.tex0(0);
  program.uniforms.exposure(options.exposure);
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);

  rt.unbind();
  return this.asFXStage(rt, 'tonemapReinhard');
};

module.exports = FXStage;
}).call(this,"/node_modules/pex-fx/lib")
},{"./FXStage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-fx/lib/FXStage.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/index.js":[function(require,module,exports){
module.exports.Plane = require('./lib/Plane');
module.exports.Cube = require('./lib/Cube');
module.exports.Box = require('./lib/Box');
module.exports.Sphere = require('./lib/Sphere');
module.exports.Tetrahedron = require('./lib/Tetrahedron');
module.exports.Octahedron = require('./lib/Octahedron');
module.exports.Icosahedron = require('./lib/Icosahedron');
module.exports.Dodecahedron = require('./lib/Dodecahedron');
module.exports.HexSphere = require('./lib/HexSphere');
module.exports.LineBuilder = require('./lib/LineBuilder');
module.exports.Loft = require('./lib/Loft');
module.exports.IsoSurface = require('./lib/IsoSurface');
},{"./lib/Box":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Box.js","./lib/Cube":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Cube.js","./lib/Dodecahedron":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Dodecahedron.js","./lib/HexSphere":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/HexSphere.js","./lib/Icosahedron":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Icosahedron.js","./lib/IsoSurface":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/IsoSurface.js","./lib/LineBuilder":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/LineBuilder.js","./lib/Loft":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Loft.js","./lib/Octahedron":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Octahedron.js","./lib/Plane":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Plane.js","./lib/Sphere":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Sphere.js","./lib/Tetrahedron":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Tetrahedron.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Box.js":[function(require,module,exports){
//Like cube but not subdivided and continuous on edges

//## Parent class : [Geometry](../Geometry.html)

//## Example use
//      var cube = new Box(1, 1, 1);
//      var cubeMesh = new Mesh(cube, new Materials.TestMaterial());

var geom = require('pex-geom');
var Vec2 = geom.Vec2;
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//### Box ( sx, sy, sz )
//`sx` - size x / width *{ Number }*  
//`sy` - size y / height *{ Number }*  
//`sz` - size z / depth *{ Number }*  
function Box(sx, sy, sz) {
  sx = sx != null ? sx : 1;
  sy = sy != null ? sy : sx != null ? sx : 1;
  sz = sz != null ? sz : sx != null ? sx : 1;

  Geometry.call(this, { vertices: true, faces: true });

  var vertices = this.vertices;
  var faces = this.faces;

  var x = sx/2;
  var y = sy/2;
  var z = sz/2;

  //bottom
  vertices.push(new Vec3(-x, -y, -z));
  vertices.push(new Vec3(-x, -y,  z));
  vertices.push(new Vec3( x, -y,  z));
  vertices.push(new Vec3( x, -y, -z));

  //top
  vertices.push(new Vec3(-x,  y, -z));
  vertices.push(new Vec3(-x,  y,  z));
  vertices.push(new Vec3( x,  y,  z));
  vertices.push(new Vec3( x,  y, -z));

  //     4----7
  //    /:   /|
  //   5----6 |
  //   | 0..|.3
  //   |,   |/
  //   1----2

  faces.push([0, 3, 2, 1]); //bottom
  faces.push([4, 5, 6, 7]); //top
  faces.push([0, 1, 5, 4]); //left
  faces.push([2, 3, 7, 6]); //right
  faces.push([1, 2, 6, 5]); //front
  faces.push([3, 0, 4, 7]); //back

  this.computeNormals();
}

Box.prototype = Object.create(Geometry.prototype);

module.exports = Box;

},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Cube.js":[function(require,module,exports){
//Cube geometry generator.

//## Parent class : [Geometry](../Geometry.html)

//## Example use
//      var cube = new Cube(1, 1, 1, 10, 10, 10);
//      var cubeMesh = new Mesh(cube, new Materials.TestMaterial());

var geom = require('pex-geom');
var Vec2 = geom.Vec2;
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//### Cube ( sx, sy, sz, nx, ny, nz )
//`sx` - size x / width *{ Number }*  
//`sy` - size y / height *{ Number }*  
//`sz` - size z / depth *{ Number }*  
//`nx` - number of subdivisions on x axis *{ Number/Int }*  
//`ny` - number of subdivisions on y axis *{ Number/Int }*  
//`nz` - number of subdivisions on z axis *{ Number/Int }*
function Cube(sx, sy, sz, nx, ny, nz) {
  sx = sx != null ? sx : 1;
  sy = sy != null ? sy : sx != null ? sx : 1;
  sz = sz != null ? sz : sx != null ? sx : 1;
  nx = nx || 1;
  ny = ny || 1;
  nz = nz || 1;

  Geometry.call(this, { vertices: true, normals: true, texCoords: true, faces: true });

  var vertices = this.vertices;
  var texCoords = this.texCoords;
  var normals = this.normals;
  var faces = this.faces;

  var vertexIndex = 0;

  // How faces are constructed:
  //
  //     0-----1 . . 2       n  <----  n+1
  //     |   / .     .       |         A
  //     | /   .     .       V         |
  //     3 . . 4 . . 5      n+nu --> n+nu+1
  //     .     .     .
  //     .     .     .
  //     6 . . 7 . . 8
  //
  function makePlane(u, v, w, su, sv, nu, nv, pw, flipu, flipv) {
    var vertShift = vertexIndex;
    for (var j=0; j<=nv; j++) {
      for (var i=0; i<=nu; i++) {
        vert = vertices[vertexIndex] = Vec3.create();
        vert[u] = (-su / 2 + i * su / nu) * flipu;
        vert[v] = (-sv / 2 + j * sv / nv) * flipv;
        vert[w] = pw;
        normal = normals[vertexIndex] = Vec3.create();
        normal[u] = 0;
        normal[v] = 0;
        normal[w] = pw / Math.abs(pw);
        texCoord = texCoords[vertexIndex] = Vec2.create();
        texCoord.x = i / nu;
        texCoord.y = 1.0 - j / nv;
        ++vertexIndex;
      }
    }
    for (var j=0; j<=nv-1; j++) {
      for (var i=0; i<=nu-1; i++) {
        var n = vertShift + j * (nu + 1) + i;
        faces.push([n, n + nu + 1, n + nu + 2, n + 1]);
      }
    }
  }

  makePlane('x', 'y', 'z', sx, sy, nx, ny, sz / 2, 1, -1);
  makePlane('x', 'y', 'z', sx, sy, nx, ny, -sz / 2, -1, -1);
  makePlane('z', 'y', 'x', sz, sy, nz, ny, -sx / 2, 1, -1);
  makePlane('z', 'y', 'x', sz, sy, nz, ny, sx / 2, -1, -1);
  makePlane('x', 'z', 'y', sx, sz, nx, nz, sy / 2, 1, 1);
  makePlane('x', 'z', 'y', sx, sz, nx, nz, -sy / 2, 1, -1);

  this.computeEdges();
}

Cube.prototype = Object.create(Geometry.prototype);

module.exports = Cube;

},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Dodecahedron.js":[function(require,module,exports){
var geom = require('pex-geom');
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//Dodecahedron
//Based on http://paulbourke.net/geometry/platonic/
function Dodecahedron(r) {
  r = r || 0.5;

  var phi = (1 + Math.sqrt(5)) / 2;
  var a = 0.5;
  var b = 0.5 * 1 / phi;
  var c = 0.5 * (2 - phi);

  var vertices = [
    new Vec3( c,  0,  a),
    new Vec3(-c,  0,  a),
    new Vec3(-b,  b,  b),
    new Vec3( 0,  a,  c),
    new Vec3( b,  b,  b),
    new Vec3( b, -b,  b),
    new Vec3( 0, -a,  c),
    new Vec3(-b, -b,  b),
    new Vec3( c,  0, -a),
    new Vec3(-c,  0, -a),
    new Vec3(-b, -b, -b),
    new Vec3( 0, -a, -c),
    new Vec3( b, -b, -b),
    new Vec3( b,  b, -b),
    new Vec3( 0,  a, -c),
    new Vec3(-b,  b, -b),
    new Vec3( a,  c,  0),
    new Vec3(-a,  c,  0),
    new Vec3(-a, -c,  0),
    new Vec3( a, -c,  0)
  ];

  vertices = vertices.map(function(v) { return v.normalize().scale(r); })

  var faces = [
    [  4,  3,  2,  1,  0 ],
    [  7,  6,  5,  0,  1 ],
    [ 12, 11, 10,  9,  8 ],
    [ 15, 14, 13,  8,  9 ],
    [ 14,  3,  4, 16, 13 ],
    [  3, 14, 15, 17,  2 ],
    [ 11,  6,  7, 18, 10 ],
    [  6, 11, 12, 19,  5 ],
    [  4,  0,  5, 19, 16 ],
    [ 12,  8, 13, 16, 19 ],
    [ 15,  9, 10, 18, 17 ],
    [  7,  1,  2, 17, 18 ]
  ];

  var edges = [
    [  0,  1 ],
    [  0,  4 ],
    [  0,  5 ],
    [  1,  2 ],
    [  1,  7 ],
    [  2,  3 ],
    [  2, 17 ],
    [  3,  4 ],
    [  3, 14 ],
    [  4, 16 ],
    [  5,  6 ],
    [  5, 19 ],
    [  6,  7 ],
    [  6, 11 ],
    [  7, 18 ],
    [  8,  9 ],
    [  8, 12 ],
    [  8, 13 ],
    [  9, 10 ],
    [  9, 15 ],
    [ 10, 11 ],
    [ 10, 18 ],
    [ 11, 12 ],
    [ 12, 19 ],
    [ 13, 14 ],
    [ 13, 16 ],
    [ 14, 15 ],
    [ 15, 17 ],
    [ 16, 19 ],
    [ 17, 18 ]
  ];

  

  Geometry.call(this, { vertices: vertices, faces: faces, edges: edges });
}

Dodecahedron.prototype = Object.create(Geometry.prototype);

module.exports = Dodecahedron;
},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/HexSphere.js":[function(require,module,exports){
var geom = require('pex-geom');
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;
var Icosahedron = require('./Icosahedron');

function next(edge) {
  return edge.face.halfEdges[(edge.slot + 1) % edge.face.length]
}

function prev(edge) {
  return edge.face.halfEdges[(edge.slot - 1 + edge.face.length) % edge.face.length]
}

function vertexEdgeLoop(edge, cb) {
  var curr = edge;

  do {
    cb(curr);
    curr = prev(curr).opposite;
  }
  while(curr != edge);
}

function centroid(points) {
  var n = points.length;
  var center = points.reduce(function(center, p) {
    return center.add(p);
  }, new Vec3(0, 0, 0));
  center.scale(1 / points.length);
  return center;
}

function elements(list, indices) {
  return indices.map(function(i) { return list[i]; })
}

//HexSphere
function HexSphere(r, level) {
  r = r || 0.5;
  level = level || 1;

  var baseGeom = new Icosahedron(r);
  for(var i=0; i<level; i++) {
    baseGeom = baseGeom.subdivideEdges();
  }

  var vertices = [];
  var faces = [];


  var halfEdgeForVertex = [];
  var halfEdges = baseGeom.computeHalfEdges();
  halfEdges.forEach(function(e) {
    halfEdgeForVertex[e.face[e.slot]] = e;
  });

  for(var i=0; i<baseGeom.vertices.length; i++) {
    var vertexIndex = vertices.length;
    var midPoints = [];
    //collect center points of neighbor faces
    vertexEdgeLoop(halfEdgeForVertex[i], function(e) {
      var midPoint = centroid(elements(baseGeom.vertices, e.face));
      midPoints.push(midPoint);
    });
    midPoints.forEach(function(p, i){
      vertices.push(p);
    });
    if (midPoints.length == 5) {
      faces.push([vertexIndex, vertexIndex+1, vertexIndex+2, vertexIndex+3, vertexIndex+4]);
    }
    if (midPoints.length == 6) {
      faces.push([vertexIndex, vertexIndex+1, vertexIndex+2, vertexIndex+3, vertexIndex+4, vertexIndex+5]);
    }
  }

  vertices.forEach(function(v) {
    v.normalize().scale(r);
  });

  Geometry.call(this, { vertices: vertices, faces: faces });

  this.computeEdges();
}

HexSphere.prototype = Object.create(Geometry.prototype);

module.exports = HexSphere;
},{"./Icosahedron":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Icosahedron.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Icosahedron.js":[function(require,module,exports){
var geom = require('pex-geom');
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//Icosahedron
//Based on http://paulbourke.net/geometry/platonic/
function Icosahedron(r) {
  r = r || 0.5;

  var phi = (1 + Math.sqrt(5)) / 2;
  var a = 1 / 2;
  var b = 1 / (2 * phi);

  var vertices = [
    new Vec3(  0,  b, -a),
    new Vec3(  b,  a,  0),
    new Vec3( -b,  a,  0),
    new Vec3(  0,  b,  a),
    new Vec3(  0, -b,  a),
    new Vec3( -a,  0,  b),
    new Vec3(  a,  0,  b),
    new Vec3(  0, -b, -a),
    new Vec3(  a,  0, -b),
    new Vec3( -a,  0, -b),
    new Vec3(  b, -a,  0),
    new Vec3( -b, -a,  0)
  ];

  vertices = vertices.map(function(v) { return v.normalize().scale(r); })

  var faces = [
    [  1,  0,  2 ],
    [  2,  3,  1 ],
    [  4,  3,  5 ],
    [  6,  3,  4 ],
    [  7,  0,  8 ],
    [  9,  0,  7 ],
    [ 10,  4, 11 ],
    [ 11,  7, 10 ],
    [  5,  2,  9 ],
    [  9, 11,  5 ],
    [  8,  1,  6 ],
    [  6, 10,  8 ],
    [  5,  3,  2 ],
    [  1,  3,  6 ],
    [  2,  0,  9 ],
    [  8,  0,  1 ],
    [  9,  7, 11 ],
    [ 10,  7,  8 ],
    [ 11,  4,  5 ],
    [  6,  4, 10 ]
  ];

  var edges = [
    [ 0,  1 ],
    [ 0,  2 ],
    [ 0,  7 ],
    [ 0,  8 ],
    [ 0,  9 ],
    [ 1,  2 ],
    [ 1,  3 ],
    [ 1,  6 ],
    [ 1,  8 ],
    [ 2,  3 ],
    [ 2,  5 ],
    [ 2,  9 ],
    [ 3,  4 ],
    [ 3,  5 ],
    [ 3,  6 ],
    [ 4,  5 ],
    [ 4,  6 ],
    [ 4, 10 ],
    [ 4, 11 ],
    [ 5,  9 ],
    [ 5, 11 ],
    [ 6,  8 ],
    [ 6, 10 ],
    [ 7,  8 ],
    [ 7,  9 ],
    [ 7, 10 ],
    [ 7, 11 ],
    [ 8, 10 ],
    [ 9, 11 ],
    [10, 11 ]
  ];

  Geometry.call(this, { vertices: vertices, faces: faces, edges: edges });
}

Icosahedron.prototype = Object.create(Geometry.prototype);

module.exports = Icosahedron;
},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/IsoSurface.js":[function(require,module,exports){
var geom = require('pex-geom');
var Vec2 = geom.Vec2;
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

function IsoSurface(gridres, size) {
  size = size || 1;
  this.numOfGridPts = gridres;

  this.tresholdValue = 1;

  this.makeGrid(size);
}

IsoSurface.prototype.makeGrid = function(size) {
  var numOfPts2 = 2/(this.numOfGridPts-1);

  this.grid = [];
  for(var x=0; x<this.numOfGridPts; x++) {
    this.grid[x] = [];
    for(var y=0; y<this.numOfGridPts; y++) {
      this.grid[x][y] = [];
      for(var z=0; z<this.numOfGridPts; z++) {
        this.grid[x][y][z] = {
          value: 0,
          position: new Vec3((x/(this.numOfGridPts-1) - 0.5)*size, (y/(this.numOfGridPts-1) - 0.5)*size, (z/(this.numOfGridPts-1) - 0.5)*size),
          normal: new Vec3(0,0,0)
        };
      }
    }
  }

  this.cubes = [];
  for (var x=0; x<this.numOfGridPts-1; x++) {
    this.cubes[x] = [];
    for (var y=0; y<this.numOfGridPts-1; y++) {
      this.cubes[x][y] = [];
      for (var z=0; z<this.numOfGridPts-1; z++) {
        this.cubes[x][y][z] = { vert: [] };
        this.cubes[x][y][z].vert[0] = this.grid[x  ][y  ][z  ];
        this.cubes[x][y][z].vert[1] = this.grid[x+1][y  ][z  ];
        this.cubes[x][y][z].vert[2] = this.grid[x+1][y  ][z+1];
        this.cubes[x][y][z].vert[3] = this.grid[x  ][y  ][z+1];
        this.cubes[x][y][z].vert[4] = this.grid[x  ][y+1][z  ];
        this.cubes[x][y][z].vert[5] = this.grid[x+1][y+1][z  ];
        this.cubes[x][y][z].vert[6] = this.grid[x+1][y+1][z+1];
        this.cubes[x][y][z].vert[7] = this.grid[x  ][y+1][z+1];
      }
    }
  }
}

IsoSurface.prototype.update = function(spheres) {
  var grid = this.grid;

  for (var x=0; x<this.numOfGridPts; x++) {
    for (var y=0; y<this.numOfGridPts; y++) {
      for (var z=0; z<this.numOfGridPts; z++) {
        grid[x][y][z].value = this.findValue(grid[x][y][z].position, spheres);
      }
    }
  }

  for (x=1; x<this.numOfGridPts-1; x++) {
    for (y=1; y<this.numOfGridPts-1; y++) {
      for (z=1; z<this.numOfGridPts-1; z++) {
        grid[x][y][z].normal.x = grid[x-1][y][z].value - grid[x+1][y][z].value;
        grid[x][y][z].normal.y = grid[x][y-1][z].value - grid[x][y+1][z].value;
        grid[x][y][z].normal.z = grid[x][y][z-1].value - grid[x][y][z+1].value;
        //grid[x][y][z].normal.normalize();
      }
    }
  }

  if (!this.geom) {
    this.geom = new Geometry({vertices: true, normals: true, texCoords: true, faces: true});
  }
  else {
    this.geom.vertices.length = 0;
    this.geom.normals.length = 0;
    this.geom.texCoords.length = 0;
    this.geom.faces.length = 0;
    this.geom.vertices.dirty = true;
    this.geom.normals.dirty = true;
    this.geom.texCoords.dirty = true;
    this.geom.faces.dirty = true;
  }
  for (var x=0; x<this.numOfGridPts-1; x++) {
    for (var y=0; y<this.numOfGridPts-1; y++) {
      for (var z=0; z<this.numOfGridPts-1; z++) {
        this.marchCube(x,y,z);
      }
    }
  }
  return this.geom;
};

IsoSurface.prototype.marchCube = function(iX, iY, iZ) {
  var cubeindex = 0;
  var edgeFlags;
  var tri;
  var v;
  var EdgeVertex = [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}];
  var d1,d2,normal;
  var cube = this.cubes[iX][iY][iZ];

  if (cube.vert[0].value > this.tresholdValue) cubeindex |= 1;
  if (cube.vert[1].value > this.tresholdValue) cubeindex |= 2;
  if (cube.vert[2].value > this.tresholdValue) cubeindex |= 4;
  if (cube.vert[3].value > this.tresholdValue) cubeindex |= 8;
  if (cube.vert[4].value > this.tresholdValue) cubeindex |= 16;
  if (cube.vert[5].value > this.tresholdValue) cubeindex |= 32;
  if (cube.vert[6].value > this.tresholdValue) cubeindex |= 64;
  if (cube.vert[7].value > this.tresholdValue) cubeindex |= 128;

  edgeFlags = CubeEdgeFlags[cubeindex];

  if (edgeFlags == 0)
    return;

  if (edgeFlags & 1   )   this.interpolate(cube.vert[0], cube.vert[1], EdgeVertex[0 ]);
  if (edgeFlags & 2   )   this.interpolate(cube.vert[1], cube.vert[2], EdgeVertex[1 ]);
  if (edgeFlags & 4   )   this.interpolate(cube.vert[2], cube.vert[3], EdgeVertex[2 ]);
  if (edgeFlags & 8   )   this.interpolate(cube.vert[3], cube.vert[0], EdgeVertex[3 ]);
  if (edgeFlags & 16  )   this.interpolate(cube.vert[4], cube.vert[5], EdgeVertex[4 ]);
  if (edgeFlags & 32  )   this.interpolate(cube.vert[5], cube.vert[6], EdgeVertex[5 ]);
  if (edgeFlags & 64  )   this.interpolate(cube.vert[6], cube.vert[7], EdgeVertex[6 ]);
  if (edgeFlags & 128 )   this.interpolate(cube.vert[7], cube.vert[4], EdgeVertex[7 ]);
  if (edgeFlags & 256 )   this.interpolate(cube.vert[0], cube.vert[4], EdgeVertex[8 ]);
  if (edgeFlags & 512 )   this.interpolate(cube.vert[1], cube.vert[5], EdgeVertex[9 ]);
  if (edgeFlags & 1024)   this.interpolate(cube.vert[2], cube.vert[6], EdgeVertex[10]);
  if (edgeFlags & 2048)   this.interpolate(cube.vert[3], cube.vert[7], EdgeVertex[11]);

  var i = this.geom.vertices.length;
  //rysujemy trojkaty, moze ich byc max 5
  for(tri = 0;tri<5;tri++) {
    if (TriangleConnectionTable[cubeindex][3*tri] < 0)
      break;

    var ab = EdgeVertex[TriangleConnectionTable[cubeindex][3*tri+1]].position.dup().sub(EdgeVertex[TriangleConnectionTable[cubeindex][3*tri+0]].position);
    var ac = EdgeVertex[TriangleConnectionTable[cubeindex][3*tri+2]].position.dup().sub(EdgeVertex[TriangleConnectionTable[cubeindex][3*tri+0]].position);
    var n = ab.dup().cross(ac);

    for(var v=0;v<3;v++) {
      d2 = EdgeVertex[TriangleConnectionTable[cubeindex][3*tri+v]];
      this.geom.vertices.push(d2.position);
      this.geom.normals.push(d2.normal);
      this.geom.texCoords.push(new Vec2(d2.normal.x*0.5+0.5, d2.normal.y*0.5+0.5));
    }

    this.geom.faces.push([i++, i++, i++]);
  }
}

IsoSurface.prototype.interpolate = function(gridPkt1, gridPkt2, vect) {
  var delta = gridPkt2.value - gridPkt1.value;

  if (delta == 0) delta = 0.0;

  var m = (this.tresholdValue - gridPkt1.value)/delta;

  vect.position = gridPkt1.position.dup().add((gridPkt2.position.dup().sub(gridPkt1.position)).dup().scale(m));
  vect.normal = gridPkt1.normal.dup().add((gridPkt2.normal.dup().sub(gridPkt1.normal)).dup().scale(m)); //position.dup().scale(0.5)
  var len = vect.normal.length();
  (len==0) ? (len=1) : (len = 1.0/len);

  vect.normal = vect.normal.dup().scale(len);
}

IsoSurface.prototype.findValue = function(position, spheres) {
  var fResult = 0;

  for(var i=0;i<spheres.length;i++) {
    var distanceSqr = position.squareDistance(spheres[i].position);
    if (distanceSqr == 0) len = 1;
    var r = spheres[i].radius;
    var f = spheres[i].force;
    fResult += f * r * r * spheres[i].radius / distanceSqr;
  }

  return fResult;
};

var CubeEdgeFlags = [
  0x000, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c, 0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x099, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c, 0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x033, 0x13a, 0x636, 0x73f, 0x435, 0x53c, 0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0x0aa, 0x7a6, 0x6af, 0x5a5, 0x4ac, 0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x066, 0x16f, 0x265, 0x36c, 0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0x0ff, 0x3f5, 0x2fc, 0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x055, 0x15c, 0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0x0cc, 0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc, 0x0cc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c, 0x15c, 0x055, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc, 0x2fc, 0x3f5, 0x0ff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c, 0x36c, 0x265, 0x16f, 0x066, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac, 0x4ac, 0x5a5, 0x6af, 0x7a6, 0x0aa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c, 0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x033, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c, 0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x099, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c, 0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x000
];

var TriangleConnectionTable = [
  [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1],
  [3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1],
  [3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1],
  [3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1],
  [9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
  [9, 2, 10, 9, 0, 2, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1],
  [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1, -1, -1, -1],
  [8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1],
  [9, 0, 1, 8, 4, 7, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1],
  [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1, -1, -1, -1],
  [3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1],
  [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1],
  [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1, -1, -1, -1],
  [4, 7, 11, 4, 11, 9, 9, 11, 10, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 5, 4, 8, 3, 5, 3, 1, 5, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
  [5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1],
  [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1],
  [9, 5, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
  [0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1],
  [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1],
  [10, 3, 11, 10, 1, 3, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1],
  [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1, -1, -1, -1],
  [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1],
  [5, 4, 8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1],
  [9, 7, 8, 5, 7, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1, -1, -1, -1, -1],
  [0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1],
  [1, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 7, 8, 9, 5, 7, 10, 1, 2, -1, -1, -1, -1, -1, -1, -1],
  [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1, -1, -1, -1],
  [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1],
  [2, 10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1],
  [7, 9, 5, 7, 8, 9, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1, -1, -1, -1],
  [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1],
  [11, 2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1, -1, -1, -1],
  [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1],
  [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1],
  [11, 10, 5, 7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1],
  [1, 6, 5, 2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 6, 5, 1, 2, 6, 3, 0, 8, -1, -1, -1, -1, -1, -1, -1],
  [9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1, -1, -1, -1],
  [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1],
  [2, 3, 11, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 0, 8, 11, 2, 0, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1],
  [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1],
  [6, 3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1, -1, -1, -1],
  [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1, -1, -1, -1],
  [6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1],
  [5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 3, 0, 4, 7, 3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1],
  [1, 9, 0, 5, 10, 6, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1],
  [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1, -1],
  [6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1],
  [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1, -1, -1, -1],
  [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
  [3, 11, 2, 7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1],
  [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1, -1, -1, -1],
  [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1],
  [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
  [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1],
  [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1],
  [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1],
  [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1],
  [10, 4, 9, 6, 4, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1],
  [10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1, -1],
  [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1, -1, -1, -1],
  [1, 4, 9, 1, 2, 4, 2, 6, 4, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1, -1, -1, -1],
  [0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1],
  [10, 4, 9, 10, 6, 4, 11, 2, 3, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1, -1, -1, -1],
  [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1],
  [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
  [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1, -1, -1, -1],
  [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1],
  [3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1],
  [6, 4, 8, 11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 10, 6, 7, 8, 10, 8, 9, 10, -1, -1, -1, -1, -1, -1, -1],
  [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1, -1, -1, -1],
  [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1],
  [10, 6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1, -1, -1, -1],
  [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1],
  [7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1],
  [7, 3, 2, 6, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1, -1, -1, -1],
  [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1],
  [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1],
  [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1],
  [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1],
  [0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1],
  [7, 11, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1],
  [10, 1, 2, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 3, 0, 8, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1],
  [2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1],
  [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1],
  [7, 2, 3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 0, 8, 7, 6, 0, 6, 2, 0, -1, -1, -1, -1, -1, -1, -1],
  [2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1, -1, -1, -1, -1],
  [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1],
  [10, 7, 6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1],
  [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1, -1, -1, -1],
  [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1, -1, -1, -1],
  [7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1],
  [6, 8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 6, 11, 3, 0, 6, 0, 4, 6, -1, -1, -1, -1, -1, -1, -1],
  [8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1, -1, -1, -1, -1, -1],
  [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1],
  [6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1],
  [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1, -1, -1, -1],
  [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1],
  [8, 2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1],
  [0, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1, -1, -1, -1],
  [1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1],
  [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1],
  [10, 1, 0, 10, 0, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1],
  [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1],
  [10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 4, 9, 5, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1],
  [5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1],
  [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1],
  [9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1],
  [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1],
  [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1, -1, -1, -1],
  [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1],
  [7, 2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1, -1, -1, -1],
  [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1, -1, -1],
  [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1],
  [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1],
  [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1],
  [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1],
  [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1],
  [6, 9, 5, 6, 11, 9, 11, 8, 9, -1, -1, -1, -1, -1, -1, -1],
  [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1, -1, -1, -1],
  [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1],
  [6, 11, 3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1, -1, -1, -1],
  [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1],
  [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1],
  [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1],
  [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1, -1, -1, -1],
  [9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1, -1],
  [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1],
  [1, 5, 6, 2, 1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1],
  [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1],
  [0, 3, 8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [10, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 5, 10, 7, 5, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1, -1, -1, -1],
  [5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1],
  [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1],
  [11, 1, 2, 11, 7, 1, 7, 5, 1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1, -1, -1, -1],
  [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1],
  [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1],
  [2, 5, 10, 2, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1],
  [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1, -1],
  [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1],
  [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1],
  [1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1],
  [9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1],
  [9, 8, 7, 5, 9, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [5, 8, 4, 5, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1],
  [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1, -1, -1],
  [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1],
  [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1],
  [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1, -1, -1, -1],
  [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1],
  [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1],
  [9, 4, 5, 2, 11, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1, -1, -1, -1],
  [5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1],
  [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1],
  [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1, -1, -1, -1],
  [8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1, -1, -1, -1],
  [0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1],
  [9, 4, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1],
  [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1],
  [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1],
  [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1, -1, -1, -1],
  [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1],
  [11, 7, 4, 11, 4, 2, 2, 4, 0, -1, -1, -1, -1, -1, -1, -1],
  [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1, -1, -1, -1],
  [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1, -1, -1, -1],
  [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1],
  [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1],
  [1, 10, 2, 8, 7, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 9, 1, 4, 1, 7, 7, 1, 3, -1, -1, -1, -1, -1, -1, -1],
  [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1, -1, -1, -1],
  [4, 0, 3, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 9, 3, 9, 11, 11, 9, 10, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 10, 0, 10, 8, 8, 10, 11, -1, -1, -1, -1, -1, -1, -1],
  [3, 1, 10, 11, 3, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 11, 1, 11, 9, 9, 11, 8, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1, -1, -1, -1],
  [0, 2, 11, 8, 0, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 2, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 3, 8, 2, 8, 10, 10, 8, 9, -1, -1, -1, -1, -1, -1, -1],
  [9, 10, 2, 0, 9, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1, -1, -1, -1],
  [1, 10, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 3, 8, 9, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 9, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 3, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]
];

module.exports = IsoSurface;
},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/LineBuilder.js":[function(require,module,exports){
var geom = require('pex-geom');
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

function LineBuilder() {
  Geometry.call(this, { vertices: true, colors: true })
}

LineBuilder.prototype = Object.create(Geometry.prototype);

LineBuilder.prototype.addLine = function(a, b, colorA, colorB) {
  colorA = colorA || { r: 1, g: 1, b: 1, a: 1 };
  colorB = colorB || colorA;
  this.vertices.push(Vec3.create().copy(a));
  this.vertices.push(Vec3.create().copy(b));
  this.colors.push(colorA);
  this.colors.push(colorB);
  this.vertices.dirty = true;
  this.colors.dirty = true;
  return this;
};

LineBuilder.prototype.addPath = function(path, color, numSamples, showPoints) {
  numSamples = numSamples || path.points.length;
  color = color || { r: 1, g: 1, b: 1, a: 1 };

  var prevPoint = path.getPointAt(0);
  if (showPoints) this.addCross(prevPoint, 0.1, color);
  for(var i=1; i<numSamples; i++) {
    var point;
    if (path.points.length == numSamples) {
      point = path.getPoint(i/(numSamples-1));
    }
    else {
      point = path.getPointAt(i/(numSamples-1));
    }
    this.addLine(prevPoint, point, color);
    prevPoint = point;
    if (showPoints) this.addCross(prevPoint, 0.1, color);
  }
  this.vertices.dirty = true;
  this.colors.dirty = true;
  return this;
}

LineBuilder.prototype.addCross = function(pos, size, color) {
  size = size || 0.1;
  var halfSize = size / 2;
  color = color || { r: 1, g: 1, b: 1, a: 1 };
  this.vertices.push(Vec3.create().set(pos.x - halfSize, pos.y, pos.z));
  this.vertices.push(Vec3.create().set(pos.x + halfSize, pos.y, pos.z));
  this.vertices.push(Vec3.create().set(pos.x, pos.y - halfSize, pos.z));
  this.vertices.push(Vec3.create().set(pos.x, pos.y + halfSize, pos.z));
  this.vertices.push(Vec3.create().set(pos.x, pos.y, pos.z - halfSize));
  this.vertices.push(Vec3.create().set(pos.x, pos.y, pos.z + halfSize));
  this.colors.push(color);
  this.colors.push(color);
  this.colors.push(color);
  this.colors.push(color);
  this.colors.push(color);
  this.colors.push(color);
  return this;
};

LineBuilder.prototype.reset = function() {
  this.vertices.length = 0;
  this.colors.length = 0;
  this.vertices.dirty = true;
  this.colors.dirty = true;
  return this;
};

module.exports = LineBuilder;

},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Loft.js":[function(require,module,exports){
var merge = require('merge');
var geom = require('pex-geom');
var Geometry = geom.Geometry;
var Vec2 = geom.Vec2;
var Vec3 = geom.Vec3;
var Mat4 = geom.Mat4;
var Quat = geom.Quat;
var Path = geom.Path;
var Spline1D = geom.Spline1D;
var Spline3D = geom.Spline3D;
var acos = Math.acos;
var PI = Math.PI;
var min = Math.min;
var LineBuilder = require('./LineBuilder');

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

// Version history
// 1. Naive implementation
// https://gist.github.com/roxlu/2859605
// 2. Fixed twists
// http://www.lab4games.net/zz85/blog/2012/04/24/spline-extrusions-tubes-and-knots-of-sorts/
// http://www.cs.cmu.edu/afs/andrew/scs/cs/15-462/web/old/asst2camera.html

var EPSILON = 0.00001;

function Loft(path, options) {
  options = options || {};
  Geometry.call(this, { vertices: true, normals: true, texCoords: true, edges: false, faces: true });
  var defaults = {
    numSteps: 200,
    numSegments: 8,
    r: 0.3,
    shapePath: null,
    xShapeScale: 1,
    caps: false,
    initialNormal: null,
    adjustAngle: 0
  };
  path.samplesCount = 5000;
  if (options.shapePath && !options.numSegments) {
    options.numSegments = options.shapePath.points.length;
  }
  this.options = options = merge(defaults, options);
  this.path = path;
  if (path.isClosed()) options.caps = false;
  this.shapePath = options.shapePath || this.makeShapePath(options.numSegments);
  this.adjustAngle = options.adjustAngle;
  this.rfunc = this.makeRadiusFunction(options.r);
  this.rufunc = options.ru ? this.makeRadiusFunction(options.ru) : this.rfunc;
  this.rvfunc = options.rv ? this.makeRadiusFunction(options.rv) : (options.ru ? this.rufunc : this.rfunc);
  this.points = this.samplePoints(path, options.numSteps, path.isClosed());
  this.tangents = this.sampleTangents(path, options.numSteps, path.isClosed());
  this.frames = this.makeFrames(this.points, this.tangents, path.isClosed());
  this.buildGeometry(options.caps);
}

Loft.prototype = Object.create(Geometry.prototype);

Loft.prototype.buildGeometry = function(caps) {
  caps = typeof caps !== 'undefined' ? caps : false;

  var index = 0;
  var numSteps = this.options.numSteps;
  var numSegments = this.options.numSegments;

  for (var i=0; i<this.frames.length; i++) {
    var frame = this.frames[i];
    var ru = this.rufunc(i, numSteps);
    var rv = this.rvfunc(i, numSteps);
    for (var j=0; j<numSegments; j++) {
      if (numSegments == this.shapePath.points.length) {
        p = this.shapePath.getPoint(j / (numSegments-1));
      }
      else {
        p = this.shapePath.getPointAt(j / (numSegments-1));
      }
      p.x *= ru;
      p.y *= rv;
      p = p.transformMat4(frame.m).add(frame.position);
      this.vertices.push(p);
      this.texCoords.push(new Vec2(j / numSegments, i / numSteps));
      this.normals.push(p.dup().sub(frame.position).normalize());
    }
  }

  if (caps) {
    this.vertices.push(this.frames[0].position);
    this.texCoords.push(new Vec2(0, 0));
    this.normals.push(this.frames[0].tangent.dup().scale(-1));
    this.vertices.push(this.frames[this.frames.length - 1].position);
    this.texCoords.push(new Vec2(0, 0));
    this.normals.push(this.frames[this.frames.length - 1].tangent.dup().scale(-1));
  }

  index = 0;
  for (var i=0; i<this.frames.length; i++) {
    for (var j=0; j<numSegments; j++) {
      if (i < numSteps - 1) {
        this.faces.push([index + (j + 1) % numSegments + numSegments, index + (j + 1) % numSegments, index + j, index + j + numSegments ]);
      }
    }
    index += numSegments;
  }
  if (this.path.isClosed()) {
    index -= numSegments;
    for (var j=0; j<numSegments; j++) {
      this.faces.push([(j + 1) % numSegments, index + (j + 1) % numSegments, index + j, j]);
    }
  }
  if (caps) {
    for (var j=0; j<numSegments; j++) {
      this.faces.push([j, (j + 1) % numSegments, this.vertices.length - 2]);
      this.faces.push([this.vertices.length - 1, index - numSegments + (j + 1) % numSegments, index - numSegments + j]);
    }
  }
};

Loft.prototype.makeShapePath = function(numSegments) {
  var shapePath = new Path();
  for (var i=0; i<numSegments; i++) {
    var t = i / numSegments;
    var a = t * 2 * Math.PI;
    var p = new Vec3(Math.cos(a), Math.sin(a), 0);
    shapePath.addPoint(p);
  }
  shapePath.close();
  return shapePath;
};

Loft.prototype.makeFrames = function(points, tangents, closed, rot) {
  if (rot == null) {
    rot = 0;
  }
  var tangent = tangents[0];
  var atx = Math.abs(tangent.x);
  var aty = Math.abs(tangent.y);
  var atz = Math.abs(tangent.z);
  var v = null;
  if (atz > atx && atz >= aty) {
    v = tangent.dup().cross(new Vec3(0, 1, 0));
  }
  else if (aty > atx && aty >= atz) {
    v = tangent.dup().cross(new Vec3(1, 0, 0));
  }
  else {
    v = tangent.dup().cross(new Vec3(0, 0, 1));
  }
  var normal = this.options.initialNormal || Vec3.create().asCross(tangent, v).normalize();
  var binormal = Vec3.create().asCross(tangent, normal).normalize();
  var prevBinormal = null;
  var prevNormal = null;
  var frames = [];
  var rotation = new Quat();
  v = new Vec3();
  for (var i = 0; i<this.points.length; i++) {
    var position = points[i];
    tangent = tangents[i];
    if (i > 0) {
      normal = normal.dup();
      binormal = binormal.dup();
      prevTangent = tangents[i - 1];
      v.asCross(prevTangent, tangent);
      if (v.length() > EPSILON) {
        v.normalize();
        theta = acos(prevTangent.dot(tangent));
        rotation.setAxisAngle(v, theta * 180 / PI);
        normal.transformQuat(rotation);
      }
      binormal.asCross(tangent, normal);
    }
    var m = new Mat4().set4x4r(binormal.x, normal.x, tangent.x, 0, binormal.y, normal.y, tangent.y, 0, binormal.z, normal.z, tangent.z, 0, 0, 0, 0, 1);
    frames.push({
      tangent: tangent,
      normal: normal,
      binormal: binormal,
      position: position,
      m: m
    });
  }
  if (closed) {
    firstNormal = frames[0].normal;
    lastNormal = frames[frames.length - 1].normal;
    theta = Math.acos(clamp(firstNormal.dot(lastNormal), 0, 1));
    theta /= frames.length - 1;
    if (tangents[0].dot(v.asCross(firstNormal, lastNormal)) > 0) {
      theta = -theta;
    }
    frames.forEach(function(frame, frameIndex) {
      rotation.setAxisAngle(frame.tangent, theta * frameIndex * 180 / PI);
      frame.normal.transformQuat(rotation);
      frame.binormal.asCross(frame.tangent, frame.normal);
      frame.m.set4x4r(frame.binormal.x, frame.normal.x, frame.tangent.x, 0, frame.binormal.y, frame.normal.y, frame.tangent.y, 0, frame.binormal.z, frame.normal.z, frame.tangent.z, 0, 0, 0, 0, 1);
    });
  }
  return frames;
};

Loft.prototype.samplePoints = function(path, numSteps, closed) {
  var points = [];
  var N = closed ? numSteps : (numSteps - 1);
  for(var i=0; i<numSteps; i++) {
    points.push(path.getPointAt(i / N));
  }
  return points;
};

Loft.prototype.sampleTangents = function(path, numSteps, closed) {
  var points = [];
  var N = closed ? numSteps : (numSteps - 1);
  for(var i=0; i<numSteps; i++) {
    points.push(path.getTangentAt(i / N));
  }
  return points;
};

Loft.prototype.makeRadiusFunction = function(r) {
  var rfunc;
  if (r instanceof Spline1D) {
    return rfunc = function(t, n) {
      return r.getPointAt(t / (n - 1));
    };
  }
  else {
    return rfunc = function(t) {
      return r;
    };
  }
};

Loft.prototype.toDebugLines = function(lineLength) {
  lineLength = lineLength || 0.5
  var lineBuilder = new LineBuilder();
  var red = { r: 1, g: 0, b: 0, a: 1};
  var green = { r: 0, g: 1, b: 0, a: 1};
  var blue = { r: 0, g: 0.5, b: 1, a: 1};
  this.frames.forEach(function(frame, frameIndex) {
    lineBuilder.addLine(frame.position, frame.position.dup().add(frame.tangent.dup().scale(lineLength)), red, red);
    lineBuilder.addLine(frame.position, frame.position.dup().add(frame.normal.dup().scale(lineLength)), green, green);
    lineBuilder.addLine(frame.position, frame.position.dup().add(frame.binormal.dup().scale(lineLength)), blue, blue);
  });
  return lineBuilder;
}


module.exports = Loft;

},{"./LineBuilder":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/LineBuilder.js","merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/node_modules/merge/merge.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Octahedron.js":[function(require,module,exports){
var geom = require('pex-geom');
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//Octahedron
//Based on http://paulbourke.net/geometry/platonic/
function Octahedron(r) {
  r = r || 0.5;

  var a = 1 / (2 * Math.sqrt(2));
  var b = 1 / 2;

  var s3 = Math.sqrt(3);
  var s6 = Math.sqrt(6);

  var vertices = [
    new Vec3(-a, 0, a), //front left
    new Vec3( a, 0, a), //front right
    new Vec3( a, 0,-a), //back right
    new Vec3(-a, 0,-a), //back left
    new Vec3( 0, b, 0), //top
    new Vec3( 0,-b, 0)  //bottom
  ];

  vertices = vertices.map(function(v) { return v.normalize().scale(r); })

  var faces = [
    [3, 0, 4],
    [2, 3, 4],
    [1, 2, 4],
    [0, 1, 4],
    [3, 2, 5],
    [0, 3, 5],
    [2, 1, 5],
    [1, 0, 5]
  ];

  var edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
    [0, 5],
    [1, 5],
    [2, 5],
    [3, 5]
  ];

  Geometry.call(this, { vertices: vertices, faces: faces, edges: edges });
}

Octahedron.prototype = Object.create(Geometry.prototype);

module.exports = Octahedron;
},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Plane.js":[function(require,module,exports){
//Plane geometry generator.

//## Parent class : [Geometry](../core/Geometry.html)

//## Example use
//      var plane = new Plane(1, 1, 10, 10, 'x', 'y');
//      var planeMesh = new Mesh(plane, new Materials.TestMaterial());

var geom = require('pex-geom');
var Vec2 = geom.Vec2;
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//## Reference
//### Plane ( sx, sy, nx, ny, u, v)
//`su` - size u / width *{ Number }*  
//`sv` - size v / height *{ Number }*  
//`nu` - number of subdivisions on u axis *{ Number/Int }*  
//`nv` - number of subdivisions on v axis *{ Number/Int }*  
//`u` - first axis *{ String }* = "x"
//`v` - second axis *{ Number/Int }* = "y"
function Plane(su, sv, nu, nv, u, v) {
  su = su || 1;
  sv = sv || su || 1;
  nu = nu || 1;
  nv = nv || nu || 1;
  u = u || 'x';
  v = v || 'y';

  Geometry.call(this, { vertices: true, normals: true, texCoords: true, faces: true, edges: true });

  var w = ['x', 'y', 'z'];
  w.splice(w.indexOf(u), 1);
  w.splice(w.indexOf(v), 1);
  w = w[0];

  var vertices = this.vertices;
  var texCoords = this.texCoords;
  var normals = this.normals;
  var faces = this.faces;
  var edges = this.edges;

  // How faces are constructed:
  //
  //     0-----1 . . 2       n  <----  n+1
  //     |   / .     .       |         A
  //     | /   .     .       V         |
  //     3 . . 4 . . 5      n+nu --> n+nu+1
  //     .     .     .
  //     .     .     .
  //     6 . . 7 . . 8
  //
  var vertShift = vertices.length;
  for(var j=0; j<=nv; ++j) {
    for(var i=0; i<=nu; ++i) {
      var vert = new Vec3();
      vert[u] = (-su/2 + i*su/nu);
      vert[v] = ( sv/2 - j*sv/nv);
      vert[w] = 0;
      vertices.push(vert);

      var texCoord = new Vec2(i/nu, 1.0 - j/nv);
      texCoords.push(texCoord);

      var normal = new Vec3();
      normal[u] = 0;
      normal[v] = 0;
      normal[w] = 1;
      normals.push(normal);
    }
  }
  for(var j=0; j<nv; ++j) {
    for(var i=0; i<nu; ++i) {
      var n = vertShift + j * (nu + 1) + i;
      var face = [n, n + nu  + 1, n + nu + 2, n + 1];

      edges.push([n, n + 1]);
      edges.push([n, n + nu + 1]);

      if (j == nv - 1) {
        edges.push([n + nu + 1, n + nu + 2]);
      }
      if (i == nu - 1) {
        edges.push([n + 1, n + nu + 2]);
      }
      faces.push(face);
    }
  }
}

Plane.prototype = Object.create(Geometry.prototype);

module.exports = Plane;
},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Sphere.js":[function(require,module,exports){
//Sphere geometry generator.

//## Parent class : [Geometry](../Geometry.html)

//## Example use
//      var sphere = new Sphere(1, 36, 36);
//      var sphereMesh = new Mesh(sphere, new Materials.TestMaterial());

var geom = require('pex-geom');
var Vec2 = geom.Vec2;
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//### Sphere ( r, nsides, nsegments )
//`r` - radius of the sphere *{ Number }*  
//`nsides` - number of subdivisions on XZ axis *{ Number }*  
//`nsegments` - number of subdivisions on Y axis *{ Number }*
function Sphere(r, nsides, nsegments) {
  r = r || 0.5;
  nsides = nsides || 36;
  nsegments = nsegments || 18;

  Geometry.call(this, { vertices: true, normals: true, texCoords: true, faces: true });

  var vertices = this.vertices;
  var texCoords = this.texCoords;
  var normals = this.normals;
  var faces = this.faces;

  var degToRad = 1/180.0 * Math.PI;

  var dphi   = 360.0/nsides;
  var dtheta = 180.0/nsegments;

  function evalPos(theta, phi) {
    var pos = new Vec3();
    pos.x = r * Math.sin(theta * degToRad) * Math.sin(phi * degToRad);
    pos.y = r * Math.cos(theta * degToRad);
    pos.z = r * Math.sin(theta * degToRad) * Math.cos(phi * degToRad);
    return pos;
  }

  for (var segment=0; segment<=nsegments; ++segment) {
    var theta = segment * dtheta;
    for (var side=0; side<=nsides; ++side) {
      var phi = side * dphi;
      var pos = evalPos(theta, phi);
      var normal = pos.dup().normalize();
      var texCoord = new Vec2(phi/360.0, theta/180.0);

      vertices.push(pos);
      normals.push(normal);
      texCoords.push(texCoord);

      if (segment == nsegments) continue;
      if (side == nsides) continue;

      if (segment == 0) {
        faces.push([
          (segment  )*(nsides+1) + side,
          (segment+1)*(nsides+1) + side,
          (segment+1)*(nsides+1) + side + 1
        ]);
      }
      else if (segment == nsegments - 1) {
        faces.push([
          (segment  )*(nsides+1) + side,
          (segment+1)*(nsides+1) + side + 1,
          (segment  )*(nsides+1) + side + 1
        ]);
      }
      else {
        faces.push([
          (segment  )*(nsides+1) + side,
          (segment+1)*(nsides+1) + side,
          (segment+1)*(nsides+1) + side + 1,
          (segment  )*(nsides+1) + side + 1
        ]);
      }
    }
  }

  this.computeEdges();
}

Sphere.prototype = Object.create(Geometry.prototype);

module.exports = Sphere;

},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/lib/Tetrahedron.js":[function(require,module,exports){
var geom = require('pex-geom');
var Vec3 = geom.Vec3;
var Geometry = geom.Geometry;

//Regular tetrahedron
//http://mathworld.wolfram.com/RegularTetrahedron.html
function Tetrahedron(r) {
  r = r || 0.5;

  var s3 = Math.sqrt(3);
  var s6 = Math.sqrt(6);

  var vertices = [
    new Vec3( s3/3, -s6/3 * 0.333 + s6*0.025,    0),   //right
    new Vec3(-s3/6, -s6/3 * 0.333 + s6*0.025,  1/2),   //left front
    new Vec3(-s3/6, -s6/3 * 0.333 + s6*0.025, -1/2),   //left back
    new Vec3(    0,  s6/3 * 0.666 + s6*0.025,    0)    //top
  ];;

  vertices = vertices.map(function(v) { return v.normalize().scale(r); })

  var faces = [
    [0, 1, 2],
    [3, 1, 0],
    [3, 0, 2],
    [3, 2, 1]
  ];

  var edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3]
  ];

  Geometry.call(this, { vertices: vertices, faces: faces, edges: edges });
}

Tetrahedron.prototype = Object.create(Geometry.prototype);

module.exports = Tetrahedron;
},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gen/node_modules/merge/merge.js":[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.1.3
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	function merge() {

		var items = Array.prototype.slice.call(arguments),
			result = items.shift(),
			deep = (result === true),
			size = items.length,
			item, index, key;

		if (deep || typeOf(result) !== 'object')

			result = {};

		for (index=0;index<size;++index)

			if (typeOf(item = items[index]) === 'object')

				for (key in item)

					result[key] = deep ? clone(item[key]) : item[key];

		return result;

	}

	function clone(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = clone(input[index]);

		}

		return output;

	}

	function typeOf(input) {

		return ({}).toString.call(input).match(/\s([\w]+)/)[1].toLowerCase();

	}

	if (isNode) {

		module.exports = merge;

	} else {

		window.merge = merge;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js":[function(require,module,exports){
module.exports.Vec2 = require('./lib/Vec2');
module.exports.Vec3 = require('./lib/Vec3');
module.exports.Vec4 = require('./lib/Vec4');
module.exports.Mat4 = require('./lib/Mat4');
module.exports.Quat = require('./lib/Quat');
module.exports.Path = require('./lib/Path');
module.exports.Rect = require('./lib/Rect');
module.exports.Spline3D = require('./lib/Spline3D');
module.exports.Spline2D = require('./lib/Spline2D');
module.exports.Spline1D = require('./lib/Spline1D');
module.exports.Ray = require('./lib/Ray');
module.exports.Plane = require('./lib/Plane');
module.exports.Geometry = require('./lib/Geometry');
module.exports.Random = require('./lib/Random');
module.exports.BoundingBox = require('./lib/BoundingBox');
module.exports.Triangle2D = require('./lib/Triangle2D');

//unpack Random methods to geom package
for(var funcName in module.exports.Random) {
  module.exports[funcName] = module.exports.Random[funcName];
}
},{"./lib/BoundingBox":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/BoundingBox.js","./lib/Geometry":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Geometry.js","./lib/Mat4":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Mat4.js","./lib/Path":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Path.js","./lib/Plane":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Plane.js","./lib/Quat":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Quat.js","./lib/Random":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Random.js","./lib/Ray":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Ray.js","./lib/Rect":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Rect.js","./lib/Spline1D":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Spline1D.js","./lib/Spline2D":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Spline2D.js","./lib/Spline3D":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Spline3D.js","./lib/Triangle2D":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Triangle2D.js","./lib/Vec2":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec2.js","./lib/Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js","./lib/Vec4":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec4.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/BoundingBox.js":[function(require,module,exports){
var Vec3 = require('./Vec3');

function BoundingBox(min, max) {
  this.min = min;
  this.max = max;
}

BoundingBox.fromPositionSize = function(pos, size) {
  return new BoundingBox(Vec3.create(pos.x - size.x / 2, pos.y - size.y / 2, pos.z - size.z / 2), Vec3.create(pos.x + size.x / 2, pos.y + size.y / 2, pos.z + size.z / 2));
};

BoundingBox.fromPoints = function(points) {
  var bbox = new BoundingBox(points[0].clone(), points[0].clone());
  points.forEach(bbox.addPoint.bind(bbox));
  return bbox;
};

BoundingBox.prototype.isEmpty = function() {
  if (!this.min || !this.max) return true;
  else return false;
};

BoundingBox.prototype.addPoint = function(p) {
  if (this.isEmpty()) {
    this.min = p.clone();
    this.max = p.clone();
  }
  if (p.x < this.min.x) this.min.x = p.x;
  if (p.y < this.min.y) this.min.y = p.y;
  if (p.z < this.min.z) this.min.z = p.z;
  if (p.x > this.max.x) this.max.x = p.x;
  if (p.y > this.max.y) this.max.y = p.y;
  if (p.z > this.max.z) this.max.z = p.z;
};

BoundingBox.prototype.getSize = function() {
  return Vec3.create(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z);
};

BoundingBox.prototype.getCenter = function(out) {
  return Vec3.create(this.min.x + (this.max.x - this.min.x) / 2, this.min.y + (this.max.y - this.min.y) / 2, this.min.z + (this.max.z - this.min.z) / 2);
};

module.exports = BoundingBox;
},{"./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Geometry.js":[function(require,module,exports){
var Vec3 = require('./Vec3');

//where does this should go? geom.Utils expanded to geom?
function centroid(points) {
  var n = points.length;
  var center = points.reduce(function(center, p) {
    return center.add(p);
  }, new Vec3(0, 0, 0));
  center.scale(1 / points.length);
  return center;
}

function edgeLoop(edge, cb) {
  var curr = edge;

  var i = 0;
  do {
    cb(curr, i++);
    curr = next(curr);
  }
  while(curr != edge);
}

function vertexEdgeLoop(edge, cb) {
  var curr = edge;

  do {
    cb(curr);
    curr = prev(curr).opposite;
  }
  while(curr != edge);
}

function next(edge) {
  return edge.face.halfEdges[(edge.slot + 1) % edge.face.length]
}

function prev(edge) {
  return edge.face.halfEdges[(edge.slot - 1 + edge.face.length) % edge.face.length]
}

function elements(list, indices) {
  return indices.map(function(i) { return list[i]; })
}

function move(a, b, t) {
  return b.dup().sub(a).normalize().scale(t).add(a);
}

function Geometry(o) {
  o = o || {};
  this.attribs = {};

  if (o.vertices) this.addAttrib('vertices', 'position', o.vertices, false);
  if (o.normals) this.addAttrib('normals', 'normal', o.normals, false);
  if (o.texCoords) this.addAttrib('texCoords', 'texCoord', o.texCoords, false);
  if (o.tangents) this.addAttrib('tangents', 'tangent', o.tangents, false);
  if (o.colors) this.addAttrib('colors', 'color', o.colors, false);
  if (o.indices) this.addIndices(o.indices);
  if (o.edges) this.addEdges(o.edges);
  if (o.faces) this.addFaces(o.faces);
}

Geometry.prototype.addAttrib = function(propertyName, attributeName, data, dynamic) {
  if (data == null) {
    data = null;
  }
  if (dynamic == null) {
    dynamic = false;
  }
  this[propertyName] = data && data.length ? data : [];
  this[propertyName].name = attributeName;
  this[propertyName].dirty = true;
  this[propertyName].dynamic = dynamic;
  this.attribs[propertyName] = this[propertyName];
  return this;
};

Geometry.prototype.addFaces = function(data, dynamic) {
  if (data == null) {
    data = null;
  }
  if (dynamic == null) {
    dynamic = false;
  }
  this.faces = data && data.length ? data : [];
  this.faces.dirty = true;
  this.faces.dynamic = false;
  return this;
};

Geometry.prototype.addEdges = function(data, dynamic) {
  if (data == null) {
    data = null;
  }
  if (dynamic == null) {
    dynamic = false;
  }
  this.edges = data && data.length ? data : [];
  this.edges.dirty = true;
  this.edges.dynamic = false;
  return this;
};

Geometry.prototype.addIndices = function(data, dynamic) {
  if (data == null) {
    data = null;
  }
  if (dynamic == null) {
    dynamic = false;
  }
  this.indices = data && data.length ? data : [];
  this.indices.dirty = true;
  this.indices.dynamic = false;
  return this;
};

Geometry.prototype.isDirty = function(attibs) {
  var dirty = false;
  dirty || (dirty = this.faces && this.faces.dirty);
  dirty || (dirty = this.edges && this.edges.dirty);
  for (attribAlias in this.attribs) {
    var attrib = this.attribs[attribAlias];
    dirty || (dirty = attrib.dirty);
  }
  return dirty;
};

Geometry.prototype.addEdge = function(a, b) {
  if (!this.edges) {
    this.addEdges();
  }
  if (!this.edgeHash) {
    this.edgeHash = {};
  }
  var ab = a + '_' + b;
  var ba = b + '_' + a;
  if (!this.edgeHash[ab] && !this.edgeHash[ba]) {
    this.edges.push([a, b]);
    return this.edgeHash[ab] = this.edgeHash[ba] = true;
  }
};

Geometry.prototype.computeEdges = function() {
  if (!this.edges) {
    this.addEdges();
  }
  else {
    this.edgeHash = null;
    this.edges.length = 0;
  }

  if (this.faces && this.faces.length) {
    this.faces.forEach(function(face) {
      for(var i=0; i<face.length; i++) {
        this.addEdge(face[i], face[(i+1)%face.length]);
      }
    }.bind(this));
  }
  else {
    for (var i=0; i<this.vertices.length-1; i++) {
      this.addEdge(i, i+1);
    }
  }
};

Geometry.prototype.computeNormals = function() {
  if (!this.faces) {
    throw 'Geometry[2]omputeSmoothNormals no faces found';
  }
  if (!this.normals) {
    this.addAttrib('normals', 'normal', null, false);
  }

  if (this.normals.length > this.vertices.length) {
    this.normals.length = vertices.length;
  }
  else {
    while (this.normals.length < this.vertices.length) {
      this.normals.push(new Vec3(0, 0, 0));
    }
  }

  var count = [];
  this.vertices.forEach(function(v, i) {
    count[i] = 0;
  }.bind(this));

  var ab = new Vec3();
  var ac = new Vec3();
  var n = new Vec3();

  this.faces.forEach(function(f) {
    var a = this.vertices[f[0]];
    var b = this.vertices[f[1]];
    var c = this.vertices[f[2]];
    ab.asSub(b, a).normalize();
    ac.asSub(c, a).normalize();
    n.asCross(ab, ac);
    for(var i=0; i<f.length; i++) {
      this.normals[f[i]].add(n);
      count[f[i]]++;
    }
  }.bind(this));

  this.normals.forEach(function(n, i) {
    n.normalize();
  });
};

Geometry.prototype.toFlatGeometry = function() {
  var g = new Geometry({ vertices: true, faces: true });

  var vertices = this.vertices;

  this.faces.forEach(function(face) {
    var newFace = [];
    face.forEach(function(vi) {
      newFace.push(g.vertices.length);
      g.vertices.push(vertices[vi]);
    });
    g.faces.push(newFace);
  });

  return g;
}

Geometry.prototype.clone = function() {
  var edges = null;
  var vertices = this.vertices.map(function(v) { return v.dup(); });
  var texCoords = this.texCoords ? this.texCoords.map(function(tc) { return tc.dup(); }) : null;
  var faces = this.faces.map(function(f) { return f.slice(0); });
  var edges = this.edges ? this.edges.map(function(e) { return e.slice(0); }) : null;
  return new Geometry({ vertices: vertices, texCoords: texCoords, faces: faces, edges: edges });
}

Geometry.prototype.triangulate = function() {
  var g = this.clone();
  g.faces = [];
  this.faces.forEach(function(face) {
    g.faces.push([face[0],face[1],face[2]]);
    for(var i=2; i<face.length-1; i++) {
      g.faces.push([face[0],face[i],face[i+1]]);
    }

  });
  return g;
}

//Based on ideas from
//http://fgiesen.wordpress.com/2012/04/03/half-edges-redux/
Geometry.prototype.computeHalfEdges = function() {
  var halfEdges = this.halfEdges = [];
  var faces = this.faces;

  faces.forEach(function(face, faceIndex) {
    face.halfEdges = [];
    face.forEach(function(vertexIndex, i) {
      var v0 = vertexIndex;
      var v1 = face[(i + 1) % face.length];
      var halfEdge = {
        edgeIndex: halfEdges.length,
        face: face,
        faceIndex: faceIndex,
        //vertexIndex: vertexIndex,
        slot: i,
        opposite: null,
        v0: Math.min(v0, v1),
        v1: Math.max(v0, v1)
      };
      face.halfEdges.push(halfEdge);
      halfEdges.push(halfEdge);
    });
  });

  halfEdges.sort(function(a, b) {
    if (a.v0 > b.v0) return 1;
    else if (a.v0 < b.v0) return -1;
    else if (a.v1 > b.v1) return 1;
    else if (a.v1 < b.v1) return -1;
    else return 0;
  });

  for(var i=1; i<halfEdges.length; i++) {
    var prev = halfEdges[i-1];
    var curr = halfEdges[i];
    if (prev.v0 == curr.v0 && prev.v1 == curr.v1) {
      prev.opposite = curr;
      curr.opposite = prev;
    }
  }

  return halfEdges;
}

Geometry.prototype.subdivideEdges = function() {
  var vertices = this.vertices;
  var faces = this.faces;

  var halfEdges = this.computeHalfEdges();

  var newVertices = vertices.map(function(v) { return v; });
  var newFaces = [];

  //edge points are an average of both edge vertices
  var edgePoints = [];
  //console.log('halfEdges', halfEdges.length, halfEdges.map(function(e) { return '' + (e.v0) + '-' + (e.v1); }));
  halfEdges.forEach(function(e) {
    if (!edgePoints[e.edgeIndex]) {
      var midPoint = centroid([
        vertices[e.face[e.slot]],
        vertices[next(e).face[next(e).slot]]
      ]);
      edgePoints[e.edgeIndex] = midPoint;
      edgePoints[e.opposite.edgeIndex] = midPoint;
      newVertices.push(midPoint);
    }
  });

  faces.forEach(function(face) {
    var newFace = [];
    edgeLoop(face.halfEdges[0], function(edge) {
      newFace.push(newVertices.indexOf(edgePoints[edge.edgeIndex]));
    });
    newFaces.push(newFace);
  });

  var visitedVertices = [];
  var verts = 0;
  halfEdges.forEach(function(e) {
    if (visitedVertices.indexOf(e.face[e.slot]) !== -1) return;
    visitedVertices.push(e.face[e.slot]);
    var neighborPoints = [];
    vertexEdgeLoop(e, function(edge) {
      neighborPoints.push(newVertices.indexOf(edgePoints[edge.edgeIndex]));
    });
    neighborPoints.forEach(function(point, i) {
      var nextPoint = neighborPoints[(i+1)%neighborPoints.length];
      newFaces.push([e.face[e.slot], point, nextPoint]);
    });
  });

  var g = new Geometry({ vertices: newVertices, faces: newFaces });
  g.computeEdges();

  return g;
}

Geometry.prototype.getFaceVertices = function(face) {
  return face.map(function(i) { return this.vertices[i]; }.bind(this));
}

//Non destructive Catmull-Clark subdivision
//Catmull-Clark subdivision for half-edge meshes
//Based on http://en.wikipedia.org/wiki/Catmull–Clark_subdivision_surface
//TODO: Study Doo-Sabin scheme for new vertices 1/n*F + 1/n*R + (n-2)/n*v
//http://www.cse.ohio-state.edu/~tamaldey/course/784/note20.pdf
//
//The shading part at the moment is that we put all vertices together at the end and have to manually
//calculate offsets at which each vertex, face and edge point end up
Geometry.prototype.catmullClark = function() {
  var vertices = this.vertices;
  var faces = this.faces;
  var halfEdges = this.computeHalfEdges();

  //face points are an average of all face points
  var facePoints = faces.map(this.getFaceVertices.bind(this)).map(centroid);

  //edge points are an average of both edge vertices and center points of two neighbor faces
  var edgePoints = [];
  halfEdges.forEach(function(e) {
    if (!edgePoints[e.edgeIndex]) {
      var midPoint = centroid([
        vertices[e.v0],
        vertices[e.v1],
        facePoints[e.faceIndex],
        facePoints[e.opposite.faceIndex]
      ]);
      edgePoints[e.edgeIndex] = midPoint;
      edgePoints[e.opposite.edgeIndex] = midPoint;
    }
  });

  //vertex points are and average of neighbor edges' edge points and neighbor faces' face points
  var vertexPoints = [];
  halfEdges.map(function(edge) {
    var vertexIndex = faces[edge.faceIndex][edge.slot];
    var vertex = vertices[vertexIndex];
    if (vertexPoints[vertexIndex]) return;
    var neighborFacePoints = [];
    //vertexEdgeLoop(edge).map(function(edge) { return facePoints[edge.faceIndex] } )
    //vertexEdgeLoop(edge).map(function(edge) { return edge.face.facePoint } )
    //extract(facePoints, vertexEdgeLoop(edge).map(prop('faceIndex'))
    var neighborEdgeMidPoints = [];
    vertexEdgeLoop(edge, function(edge) {
      neighborFacePoints.push(facePoints[edge.faceIndex]);
      neighborEdgeMidPoints.push(centroid([vertices[edge.v0], vertices[edge.v1]]));
    });
    var facesCentroid = centroid(neighborFacePoints);
    var edgesCentroid = centroid(neighborEdgeMidPoints);

    var n = neighborFacePoints.length;
    var v = new Vec3(0, 0, 0);
    v.add(facesCentroid);
    v.add(edgesCentroid.dup().scale(2));
    v.add(vertex.dup().scale(n - 3));
    v.scale(1/n);

    vertexPoints[vertexIndex] = v;
  });

  //create list of points for the new mesh
  //vertx poitns and face points are unique
  var newVertices = vertexPoints.concat(facePoints);

  //halfEdge mid points are not (each one is doubled)
  halfEdges.forEach(function(e) {
    if (e.added > -1) return;
    e.added = newVertices.length;
    e.opposite.added = newVertices.length;
    newVertices.push(edgePoints[e.edgeIndex]);
  })

  var newFaces = [];
  var newEdges = [];

  //construct new faces from face point, two edges mid points and a vertex between them
  faces.forEach(function(face, faceIndex) {
    var facePointIndex = faceIndex + vertexPoints.length;
    edgeLoop(face.halfEdges[0], function(edge) {
      var edgeMidPointsIndex = edge.added;
      var nextEdge = next(edge);
      var nextEdgeVertexIndex = face[nextEdge.slot];
      var nextEdgeMidPointIndex = nextEdge.added;
      newEdges.push([facePointIndex, edgeMidPointsIndex]);
      newEdges.push([edgeMidPointsIndex, nextEdgeVertexIndex]);
      newFaces.push([facePointIndex, edgeMidPointsIndex, nextEdgeVertexIndex, nextEdgeMidPointIndex])
    });
  });

  return new Geometry({ vertices: newVertices, faces: newFaces, edges: newEdges });
}

//Doo-Sabin subdivision as desribed in WIRE AND COLUMN MODELING
//http://repository.tamu.edu/bitstream/handle/1969.1/548/etd-tamu-2004A-VIZA-mandal-1.pdf  
Geometry.prototype.dooSabin = function(depth) {
  var vertices = this.vertices;
  var faces = this.faces;
  var halfEdges = this.computeHalfEdges();

  var newVertices = [];
  var newFaces = [];
  var newEdges = [];

  depth = depth || 0.1;

  var facePointsByFace = [];

  var self = this;

  faces.forEach(function(face, faceIndex) {
    var facePoints = facePointsByFace[faceIndex] = [];
    edgeLoop(face.halfEdges[0], function(edge) {
      var v = vertices[edge.face[edge.slot]];
      var p = centroid([
        v,
        centroid(elements(vertices, edge.face)),
        centroid(elements(vertices, [edge.v0, edge.v1])),
        centroid(elements(vertices, [prev(edge).v0, prev(edge).v1]))
      ]);
      facePoints.push(newVertices.length);
      newVertices.push(move(v, p, depth));
      //newVertices.push(p);
    });
    return facePoints;
  });

  //face face
  faces.forEach(function(face, faceIndex) {
    newFaces.push(facePointsByFace[faceIndex]);
  });

  halfEdges.forEach(function(edge, edgeIndex) {
    if (edge.edgeVisited) return;

    edge.edgeVisited = true;
    edge.opposite.edgeVisited = true;

    //edge face
    var e0 = edge;
    var e1 = next(e0.opposite);
    var e2 = e0.opposite;
    var e3 = next(e0);
    var newFace = [
      facePointsByFace[e0.faceIndex][e0.slot],
      facePointsByFace[e1.faceIndex][e1.slot],
      facePointsByFace[e2.faceIndex][e2.slot],
      facePointsByFace[e3.faceIndex][e3.slot]
    ];
    newFaces.push(newFace);
    newEdges.push([newFace[0], newFace[3]]);
    newEdges.push([newFace[1], newFace[2]]);
  });

  halfEdges.forEach(function(edge, edgeIndex) {
    if (edge.vertexVisited) return;

    //vertex face
    var vertexFace = [];
    vertexEdgeLoop(edge, function(e) {
      e.vertexVisited = true;
      vertexFace.push(facePointsByFace[e.faceIndex][e.slot])
    });
    newFaces.push(vertexFace)
    vertexFace.forEach(function(i, index) {
      newEdges.push([i, vertexFace[(index+1)%vertexFace.length]]);
    });
  });

  return new Geometry({ vertices: newVertices, faces: newFaces, edges: newEdges });
}

//Mesh wire modelling as described in
//http://repository.tamu.edu/bitstream/handle/1969.1/548/etd-tamu-2004A-VIZA-mandal-1.pdf  
Geometry.prototype.wire = function(edgeDepth, insetDepth) {
  insetDepth = (insetDepth != null) ? insetDepth : (edgeDepth || 0.1);
  edgeDepth = edgeDepth || 0.1;
  var newGeom = this.dooSabin(edgeDepth);
  newGeom.computeNormals();
  var halfEdges = newGeom.computeHalfEdges();
  var innerGeom = this.dooSabin(edgeDepth);
  innerGeom.computeNormals();

  //shrink the inner geometry
  innerGeom.vertices.forEach(function(v, vi) {
    v.sub(innerGeom.normals[vi].dup().scale(insetDepth));
  });

  //remove middle faces
  var cutFaces = newGeom.faces.splice(0, this.faces.length);
  innerGeom.faces.splice(0, this.faces.length);

  var vertexOffset = newGeom.vertices.length;

  //add inner vertices to new geom
  innerGeom.vertices.forEach(function(v, vi) {
    newGeom.vertices.push(v);
  });

  //add inner faces to new geom
  innerGeom.faces.forEach(function(f) {
    newGeom.faces.push(f.map(function(vi) {
      return vi + vertexOffset;
    }).reverse());
  });

  //add inner edges to new geom
  innerGeom.edges.forEach(function(e) {
    newGeom.edges.push(e.map(function(vi) {
      return vi + vertexOffset;
    }));
  });

  cutFaces.forEach(function(face) {
    edgeLoop(face.halfEdges[0], function(e) {
      var pe = prev(e);
      newGeom.faces.push([
        pe.face[pe.slot],
        e.face[e.slot],
        e.face[e.slot] + vertexOffset,
        pe.face[pe.slot] + vertexOffset
      ]);

      newGeom.edges.push([
        pe.face[pe.slot],
        pe.face[pe.slot] + vertexOffset
      ]);

      newGeom.edges.push([
        e.face[e.slot],
        e.face[e.slot] + vertexOffset
      ]);
    });
  });

  return newGeom;
}

Geometry.prototype.extrude = function(height, faceIndices, shrink) {
  height = height || 0.1;
  shrink = shrink || 0;
  if (!faceIndices) faceIndices = this.faces.map(function(face, faceIndex) { return faceIndex; });
  var g = this.clone();
  var halfEdges = g.computeHalfEdges();

  var ab = new Vec3();
  var ac = new Vec3();
  var faceNormal = new Vec3();
  var tmp = new Vec3();

  faceIndices.forEach(function(faceIndex) {
    var face = g.faces[faceIndex];
    var faceVerts = elements(g.vertices, face);
    var faceTexCoords = g.texCoords ? elements(g.texCoords, face) : null;

    var a = faceVerts[0];
    var b = faceVerts[1];
    var c = faceVerts[2];
    ab.asSub(b, a).normalize();
    ac.asSub(c, a).normalize();
    faceNormal.asCross(ab, ac).normalize();
    faceNormal.scale(height);

    var newVerts = faceVerts.map(function(v) {
      return v.dup().add(faceNormal);
    });

    var newVertsIndices = [];

    newVerts.forEach(function(nv) {
      newVertsIndices.push(g.vertices.length);
      g.vertices.push(nv);
    });

    if (faceTexCoords) {
      var newTexCoords = faceTexCoords.map(function(tc) {
        return tc.dup();
      });

      newTexCoords.forEach(function(tc) {
        g.texCoords.push(tc);
      });
    }

    if (shrink) {
      var c = centroid(newVerts);
      newVerts.forEach(function(nv) {
        tmp.asSub(c, nv);
        tmp.scale(shrink);
        nv.add(tmp);
      })
    }

    //add new face for each extruded edge
    edgeLoop(face.halfEdges[0], function(e) {
      g.faces.push([
        face[e.slot],
        face[next(e).slot],
        newVertsIndices[next(e).slot],
        newVertsIndices[e.slot]
      ]);
    });

    //add edges
    if (g.edges) {
      newVertsIndices.forEach(function(i, index) {
        g.edges.push([i, face[index]]);
      });
      newVertsIndices.forEach(function(i, index) {
        g.edges.push([i, newVertsIndices[(index+1)%newVertsIndices.length]]);
      });
    }

    //push the old face outside
    newVertsIndices.forEach(function(nvi, i) {
      face[i] = nvi;
    });
  });

  return g;
}

module.exports = Geometry;

},{"./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Mat4.js":[function(require,module,exports){
var Vec3 = require('./Vec3');

function Mat4() {
  this.reset();
}

Mat4.create = function() {
  return new Mat4();
};

Mat4.prototype.equals = function(m, tolerance) {
  if (tolerance == null) {
    tolerance = 0.0000001;
  }
  return (Math.abs(m.a11 - this.a11) <= tolerance) && (Math.abs(m.a12 - this.a12) <= tolerance) && (Math.abs(m.a13 - this.a13) <= tolerance) && (Math.abs(m.a14 - this.a14) <= tolerance) && (Math.abs(m.a21 - this.a21) <= tolerance) && (Math.abs(m.a22 - this.a22) <= tolerance) && (Math.abs(m.a23 - this.a23) <= tolerance) && (Math.abs(m.a24 - this.a24) <= tolerance) && (Math.abs(m.a31 - this.a31) <= tolerance) && (Math.abs(m.a32 - this.a32) <= tolerance) && (Math.abs(m.a33 - this.a33) <= tolerance) && (Math.abs(m.a34 - this.a34) <= tolerance) && (Math.abs(m.a41 - this.a41) <= tolerance) && (Math.abs(m.a42 - this.a42) <= tolerance) && (Math.abs(m.a43 - this.a43) <= tolerance) && (Math.abs(m.a44 - this.a44) <= tolerance);
};

Mat4.prototype.hash = function() {
  return this.a11 * 0.01 + this.a12 * 0.02 + this.a13 * 0.03 + this.a14 * 0.04 + this.a21 * 0.05 + this.a22 * 0.06 + this.a23 * 0.07 + this.a24 * 0.08 + this.a31 * 0.09 + this.a32 * 0.10 + this.a33 * 0.11 + this.a34 * 0.12 + this.a41 * 0.13 + this.a42 * 0.14 + this.a43 * 0.15 + this.a44 * 0.16;
};

Mat4.prototype.set4x4r = function(a11, a12, a13, a14, a21, a22, a23, a24, a31, a32, a33, a34, a41, a42, a43, a44) {
  this.a11 = a11;
  this.a12 = a12;
  this.a13 = a13;
  this.a14 = a14;
  this.a21 = a21;
  this.a22 = a22;
  this.a23 = a23;
  this.a24 = a24;
  this.a31 = a31;
  this.a32 = a32;
  this.a33 = a33;
  this.a34 = a34;
  this.a41 = a41;
  this.a42 = a42;
  this.a43 = a43;
  this.a44 = a44;
  return this;
};

Mat4.prototype.copy = function(m) {
  this.a11 = m.a11;
  this.a12 = m.a12;
  this.a13 = m.a13;
  this.a14 = m.a14;
  this.a21 = m.a21;
  this.a22 = m.a22;
  this.a23 = m.a23;
  this.a24 = m.a24;
  this.a31 = m.a31;
  this.a32 = m.a32;
  this.a33 = m.a33;
  this.a34 = m.a34;
  this.a41 = m.a41;
  this.a42 = m.a42;
  this.a43 = m.a43;
  this.a44 = m.a44;
  return this;
};

Mat4.prototype.dup = function() {
  return Mat4.create().copy(this);
};

Mat4.prototype.reset = function() {
  this.set4x4r(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  return this;
};

Mat4.prototype.identity = function() {
  this.reset();
  return this;
};

Mat4.prototype.mul4x4r = function(b11, b12, b13, b14, b21, b22, b23, b24, b31, b32, b33, b34, b41, b42, b43, b44) {
  var a11 = this.a11;
  var a12 = this.a12;
  var a13 = this.a13;
  var a14 = this.a14;
  var a21 = this.a21;
  var a22 = this.a22;
  var a23 = this.a23;
  var a24 = this.a24;
  var a31 = this.a31;
  var a32 = this.a32;
  var a33 = this.a33;
  var a34 = this.a34;
  var a41 = this.a41;
  var a42 = this.a42;
  var a43 = this.a43;
  var a44 = this.a44;
  this.a11 = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
  this.a12 = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
  this.a13 = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
  this.a14 = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
  this.a21 = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
  this.a22 = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
  this.a23 = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
  this.a24 = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
  this.a31 = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
  this.a32 = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
  this.a33 = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
  this.a34 = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
  this.a41 = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
  this.a42 = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
  this.a43 = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
  this.a44 = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
  return this;
};

Mat4.prototype.perspective = function(fovy, aspect, znear, zfar) {
  var f = 1.0 / Math.tan(fovy / 180 * Math.PI / 2);
  var nf = 1.0 / (znear - zfar);
  this.mul4x4r(f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (zfar + znear) * nf, 2 * znear * zfar * nf, 0, 0, -1, 0);
  return this;
};

Mat4.prototype.ortho = function(l, r, b, t, n, f) {
  this.mul4x4r(2 / (r - l), 0, 0, (r + l) / (l - r), 0, 2 / (t - b), 0, (t + b) / (b - t), 0, 0, 2 / (n - f), (f + n) / (n - f), 0, 0, 0, 1);
  return this;
};

Mat4.prototype.lookAt = function(eye, target, up) {
  var z = (Vec3.create(eye.x - target.x, eye.y - target.y, eye.z - target.z)).normalize();
  var x = (Vec3.create(up.x, up.y, up.z)).cross(z).normalize();
  var y = Vec3.create().copy(z).cross(x).normalize();
  this.mul4x4r(x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1);
  this.translate(-eye.x, -eye.y, -eye.z);
  return this;
};

Mat4.prototype.translate = function(dx, dy, dz) {
  this.mul4x4r(1, 0, 0, dx, 0, 1, 0, dy, 0, 0, 1, dz, 0, 0, 0, 1);
  return this;
};

Mat4.prototype.rotate = function(theta, x, y, z) {
  var s = Math.sin(theta);
  var c = Math.cos(theta);
  this.mul4x4r(x * x * (1 - c) + c, x * y * (1 - c) - z * s, x * z * (1 - c) + y * s, 0, y * x * (1 - c) + z * s, y * y * (1 - c) + c, y * z * (1 - c) - x * s, 0, x * z * (1 - c) - y * s, y * z * (1 - c) + x * s, z * z * (1 - c) + c, 0, 0, 0, 0, 1);
  return this;
};

Mat4.prototype.asMul = function(a, b) {
  var a11 = a.a11;
  var a12 = a.a12;
  var a13 = a.a13;
  var a14 = a.a14;
  var a21 = a.a21;
  var a22 = a.a22;
  var a23 = a.a23;
  var a24 = a.a24;
  var a31 = a.a31;
  var a32 = a.a32;
  var a33 = a.a33;
  var a34 = a.a34;
  var a41 = a.a41;
  var a42 = a.a42;
  var a43 = a.a43;
  var a44 = a.a44;
  var b11 = b.a11;
  var b12 = b.a12;
  var b13 = b.a13;
  var b14 = b.a14;
  var b21 = b.a21;
  var b22 = b.a22;
  var b23 = b.a23;
  var b24 = b.a24;
  var b31 = b.a31;
  var b32 = b.a32;
  var b33 = b.a33;
  var b34 = b.a34;
  var b41 = b.a41;
  var b42 = b.a42;
  var b43 = b.a43;
  var b44 = b.a44;
  this.a11 = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
  this.a12 = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
  this.a13 = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
  this.a14 = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
  this.a21 = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
  this.a22 = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
  this.a23 = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
  this.a24 = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
  this.a31 = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
  this.a32 = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
  this.a33 = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
  this.a34 = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
  this.a41 = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
  this.a42 = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
  this.a43 = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
  this.a44 = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
  return this;
};

Mat4.prototype.mul = function(b) {
  return this.asMul(this, b);
};

Mat4.prototype.scale = function(sx, sy, sz) {
  this.mul4x4r(sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1);
  return this;
};

Mat4.prototype.invert = function() {
  var x0 = this.a11;
  var x1 = this.a12;
  var x2 = this.a13;
  var x3 = this.a14;
  var x4 = this.a21;
  var x5 = this.a22;
  var x6 = this.a23;
  var x7 = this.a24;
  var x8 = this.a31;
  var x9 = this.a32;
  var x10 = this.a33;
  var x11 = this.a34;
  var x12 = this.a41;
  var x13 = this.a42;
  var x14 = this.a43;
  var x15 = this.a44;
  var a0 = x0 * x5 - x1 * x4;
  var a1 = x0 * x6 - x2 * x4;
  var a2 = x0 * x7 - x3 * x4;
  var a3 = x1 * x6 - x2 * x5;
  var a4 = x1 * x7 - x3 * x5;
  var a5 = x2 * x7 - x3 * x6;
  var b0 = x8 * x13 - x9 * x12;
  var b1 = x8 * x14 - x10 * x12;
  var b2 = x8 * x15 - x11 * x12;
  var b3 = x9 * x14 - x10 * x13;
  var b4 = x9 * x15 - x11 * x13;
  var b5 = x10 * x15 - x11 * x14;
  var invdet = 1 / (a0 * b5 - a1 * b4 + a2 * b3 + a3 * b2 - a4 * b1 + a5 * b0);
  this.a11 = (+x5 * b5 - x6 * b4 + x7 * b3) * invdet;
  this.a12 = (-x1 * b5 + x2 * b4 - x3 * b3) * invdet;
  this.a13 = (+x13 * a5 - x14 * a4 + x15 * a3) * invdet;
  this.a14 = (-x9 * a5 + x10 * a4 - x11 * a3) * invdet;
  this.a21 = (-x4 * b5 + x6 * b2 - x7 * b1) * invdet;
  this.a22 = (+x0 * b5 - x2 * b2 + x3 * b1) * invdet;
  this.a23 = (-x12 * a5 + x14 * a2 - x15 * a1) * invdet;
  this.a24 = (+x8 * a5 - x10 * a2 + x11 * a1) * invdet;
  this.a31 = (+x4 * b4 - x5 * b2 + x7 * b0) * invdet;
  this.a32 = (-x0 * b4 + x1 * b2 - x3 * b0) * invdet;
  this.a33 = (+x12 * a4 - x13 * a2 + x15 * a0) * invdet;
  this.a34 = (-x8 * a4 + x9 * a2 - x11 * a0) * invdet;
  this.a41 = (-x4 * b3 + x5 * b1 - x6 * b0) * invdet;
  this.a42 = (+x0 * b3 - x1 * b1 + x2 * b0) * invdet;
  this.a43 = (-x12 * a3 + x13 * a1 - x14 * a0) * invdet;
  this.a44 = (+x8 * a3 - x9 * a1 + x10 * a0) * invdet;
  return this;
};

Mat4.prototype.transpose = function() {
  var a11 = this.a11;
  var a12 = this.a12;
  var a13 = this.a13;
  var a14 = this.a14;
  var a21 = this.a21;
  var a22 = this.a22;
  var a23 = this.a23;
  var a24 = this.a24;
  var a31 = this.a31;
  var a32 = this.a32;
  var a33 = this.a33;
  var a34 = this.a34;
  var a41 = this.a41;
  var a42 = this.a42;
  var a43 = this.a43;
  var a44 = this.a44;
  this.a11 = a11;
  this.a12 = a21;
  this.a13 = a31;
  this.a14 = a41;
  this.a21 = a12;
  this.a22 = a22;
  this.a23 = a32;
  this.a24 = a42;
  this.a31 = a13;
  this.a32 = a23;
  this.a33 = a33;
  this.a34 = a43;
  this.a41 = a14;
  this.a42 = a24;
  this.a43 = a34;
  this.a44 = a44;
  return this;
};

Mat4.prototype.toArray = function() {
  return [this.a11, this.a21, this.a31, this.a41, this.a12, this.a22, this.a32, this.a42, this.a13, this.a23, this.a33, this.a43, this.a14, this.a24, this.a34, this.a44];
};

Mat4.prototype.fromArray = function(a) {
  this.a11 = a[0](this.a21 = a[1](this.a31 = a[2](this.a41 = a[3])));
  this.a12 = a[4](this.a22 = a[5](this.a32 = a[6](this.a42 = a[7])));
  this.a13 = a[8](this.a23 = a[9](this.a33 = a[10](this.a43 = a[11])));
  this.a14 = a[12](this.a24 = a[13](this.a34 = a[14](this.a44 = a[15])));
  return this;
};

module.exports = Mat4;

},{"./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Path.js":[function(require,module,exports){
var Vec3 = require('./Vec3');

function Path(points, closed) {
  this.points = points || [];
  this.dirtyLength = true;
  this.closed = closed || false;
  this.samplesCount = 1000;
}

Path.prototype.addPoint = function(p) {
  return this.points.push(p);
};

Path.prototype.getPoint = function(t, debug) {
  var point = t * (this.points.length - 1);
  var intPoint = Math.floor(point);
  var weight = point - intPoint;
  var c0 = intPoint;
  var c1 = intPoint + 1;
  if (intPoint === this.points.length - 1) {
    c0 = intPoint;
    c1 = intPoint;
  }
  var vec = new Vec3();
  vec.x = this.points[c0].x + (this.points[c1].x - this.points[c0].x) * weight;
  vec.y = this.points[c0].y + (this.points[c1].y - this.points[c0].y) * weight;
  vec.z = this.points[c0].z + (this.points[c1].z - this.points[c0].z) * weight;
  return vec;
};

Path.prototype.getPointAt = function(d) {
  if (!this.closed) {
    d = Math.max(0, Math.min(d, 1));
  }
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  var k = 0;
  for (var i=0; i<this.accumulatedLengthRatios.length; i++) {
    if (this.accumulatedLengthRatios[i] > d - 1/this.samplesCount) {
      k = this.accumulatedRatios[i];
      break;
    }
  }
  return this.getPoint(k, true);
};

//naive implementation
Path.prototype.getClosestPoint = function(point) {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  var closesPoint = this.precalculatedPoints.reduce(function(best, p) {
    var dist = point.squareDistance(p);
    if (dist < best.dist) {
      return { dist: dist, point: p };
    }
    else return best;
  }, { dist: Infinity, point: null });
  return closesPoint.point;
}

Path.prototype.getClosestPointRatio = function(point) {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  var closesPoint = this.precalculatedPoints.reduce(function(best, p, pIndex) {
    var dist = point.squareDistance(p);
    if (dist < best.dist) {
      return { dist: dist, point: p, index: pIndex };
    }
    else return best;
  }, { dist: Infinity, point: null, index: -1 });
  return this.accumulatedLengthRatios[closesPoint.index];
}

Path.prototype.close = function() {
  return this.closed = true;
};

Path.prototype.isClosed = function() {
  return this.closed;
};

Path.prototype.reverse = function() {
  this.points = this.points.reverse();
  return this.dirtyLength = true;
};

Path.prototype.precalculateLength = function() {
  this.accumulatedRatios = [];
  this.accumulatedLengthRatios = [];
  this.accumulatedLengths = [];
  this.precalculatedPoints = [];

  var step = 1 / this.samplesCount;
  var k = 0;
  var totalLength = 0;
  var point = null;
  var prevPoint = null;

  for (var i=0; i<this.samplesCount; i++) {
    prevPoint = point;
    point = this.getPoint(k);
    if (i > 0) {
      totalLength += point.dup().sub(prevPoint).length();;
    }
    this.accumulatedRatios.push(k);
    this.accumulatedLengths.push(totalLength);
    this.precalculatedPoints.push(point);
    k += step;
  }
  for (var i=0; i<this.accumulatedLengths.length - 1; i++) {
    this.accumulatedLengthRatios.push(this.accumulatedLengths[i] / totalLength);
  }
  this.length = totalLength;
  return this.dirtyLength = false;
};

module.exports = Path;

},{"./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Plane.js":[function(require,module,exports){
var Vec2 = require('./Vec2');
var Vec3 = require('./Vec3');

function Plane(point, normal) {
  this.point = point;
  this.normal = normal;
  this.u = new Vec3();
  this.v = new Vec3();
  this.updateUV();
}

Plane.prototype.set = function(point, normal) {
  this.point = point;
  this.normal = normal;
}

Plane.prototype.setPoint = function(point) {
  this.point = point;
}

Plane.prototype.setNormal = function(normal) {
  this.normal = normal;
}

Plane.prototype.project = function(p) {
  var D = Vec3.create().asSub(p, this.point);
  var scale = D.dot(this.normal);
  var scaled = this.normal.clone().scale(scale);
  var projected = p.clone().sub(scaled);
  return projected;
}

Plane.prototype.intersectRay = function(ray) {
  return ray.hitTestPlane(this.point, this.normal)[0];
}

Plane.prototype.updateUV = function() {
  if (Math.abs(this.normal.x) > Math.abs(this.normal.y)) {
    var invLen = 1 / Math.sqrt(this.normal.x * this.normal.x + this.normal.z * this.normal.z);
    this.u.set( this.normal.x * invLen, 0, -this.normal.z * invLen);
  }
  else {
    var invLen = 1 / Math.sqrt(this.normal.y * this.normal.y + this.normal.z * this.normal.z);
    this.u.set( 0, this.normal.z * invLen, -this.normal.y * invLen);
  }

  this.v.setVec3(this.normal).cross(this.u);
}

Plane.prototype.project = function(p) {
  var D = Vec3.create().asSub(p, this.point);
  var scale = D.dot(this.normal);
  var scaled = this.normal.clone().scale(scale);
  var projected = p.clone().sub(scaled);
  return projected;
}

Plane.prototype.rebase = function(p) {
  var diff = p.dup().sub(this.point);
  var x = this.u.dot(diff);
  var y = this.v.dot(diff);
  return new Vec2(x, y);
}

module.exports = Plane;
},{"./Vec2":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec2.js","./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Quat.js":[function(require,module,exports){
var Mat4 = require('./Mat4');
var Vec3 = require('./Vec3');
var kEpsilon = Math.pow(2, -24);

function Quat(x, y, z, w) {
  this.x = x != null ? x : 0;
  this.y = y != null ? y : 0;
  this.z = z != null ? z : 0;
  this.w = w != null ? w : 1;
}

Quat.create = function(x, y, z, w) {
  return new Quat(x, y, z, w);
};

Quat.prototype.identity = function() {
  this.set(0, 0, 0, 1);
  return this;
};

Quat.prototype.equals = function(q, tolerance) {
  if (tolerance == null) {
    tolerance = 0.0000001;
  }
  return (Math.abs(q.x - this.x) <= tolerance) && (Math.abs(q.y - this.y) <= tolerance) && (Math.abs(q.z - this.z) <= tolerance) && (Math.abs(q.w - this.w) <= tolerance);
};

Quat.prototype.hash = function() {
  return 1 * this.x + 12 * this.y + 123 * this.z + 1234 * this.w;
};

Quat.prototype.copy = function(q) {
  this.x = q.x;
  this.y = q.y;
  this.z = q.z;
  this.w = q.w;
  return this;
};

Quat.prototype.clone = function() {
  return new Quat(this.x, this.y, this.z, this.w);
};

Quat.prototype.dup = function() {
  return this.clone();
};

Quat.prototype.setAxisAngle = function(v, a) {
  a = a * 0.5;
  var s = Math.sin(a / 180 * Math.PI);
  this.x = s * v.x;
  this.y = s * v.y;
  this.z = s * v.z;
  this.w = Math.cos(a / 180 * Math.PI);
  return this;
};

Quat.prototype.setQuat = function(q) {
  this.x = q.x;
  this.y = q.y;
  this.z = q.z;
  this.w = q.w;
  return this;
};

Quat.prototype.set = function(x, y, z, w) {
  this.x = x;
  this.y = y;
  this.z = z;
  this.w = w;
  return this;
};

Quat.prototype.asMul = function(p, q) {
  var px = p.x;
  var py = p.y;
  var pz = p.z;
  var pw = p.w;
  var qx = q.x;
  var qy = q.y;
  var qz = q.z;
  var qw = q.w;
  this.x = px * qw + pw * qx + py * qz - pz * qy;
  this.y = py * qw + pw * qy + pz * qx - px * qz;
  this.z = pz * qw + pw * qz + px * qy - py * qx;
  this.w = pw * qw - px * qx - py * qy - pz * qz;
  return this;
};

Quat.prototype.mul = function(q) {
  this.asMul(this, q);
  return this;
};

Quat.prototype.mul4 = function(x, y, z, w) {
  var ax = this.x;
  var ay = this.y;
  var az = this.z;
  var aw = this.w;
  this.x = w * ax + x * aw + y * az - z * ay;
  this.y = w * ay + y * aw + z * ax - x * az;
  this.z = w * az + z * aw + x * ay - y * ax;
  this.w = w * aw - x * ax - y * ay - z * az;
  return this;
};

Quat.prototype.length = function() {
  return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
};

Quat.prototype.normalize = function() {
  var len = this.length();
  if (len > kEpsilon) {
    this.x /= len;
    this.y /= len;
    this.z /= len;
    this.w /= len;
  }
  return this;
};

Quat.prototype.toMat4 = function(out) {
  var xs = this.x + this.x;
  var ys = this.y + this.y;
  var zs = this.z + this.z;
  var wx = this.w * xs;
  var wy = this.w * ys;
  var wz = this.w * zs;
  var xx = this.x * xs;
  var xy = this.x * ys;
  var xz = this.x * zs;
  var yy = this.y * ys;
  var yz = this.y * zs;
  var zz = this.z * zs;
  var m = out || new Mat4();
  return m.set4x4r(1 - (yy + zz), xy - wz, xz + wy, 0, xy + wz, 1 - (xx + zz), yz - wx, 0, xz - wy, yz + wx, 1 - (xx + yy), 0, 0, 0, 0, 1);
};

Quat.prototype.setDirection = function(direction, debug) {
  var dir = Vec3.create().copy(direction).normalize();

  var up = Vec3.create(0, 1, 0);

  var right = Vec3.create().asCross(up, dir);

  //if debug then console.log('right', right)

  if (right.length() == 0) {
    up.set(1, 0, 0)
    right.asCross(up, dir);
  }

  up.asCross(dir, right);
  right.normalize();
  up.normalize();

  if (debug) console.log('dir', dir);
  if (debug) console.log('up', up);
  if (debug) console.log('right', right);

  var m = new Mat4();
  m.set4x4r(
    right.x, right.y, right.z, 0,
    up.x, up.y, up.z, 0,
    dir.x, dir.y, dir.z, 0,
    0, 0, 0, 1
  );

  //Step 3. Build a quaternion from the matrix
  var q = new Quat()
  if (1.0 + m.a11 + m.a22 + m.a33 < 0.001) {
    if (debug) console.log('singularity');
    dir = direction.dup();
    dir.z *= -1;
    dir.normalize();
    up.set(0, 1, 0);
    right.asCross(up, dir);
    up.asCross(dir, right);
    right.normalize();
    up.normalize();
    m = new Mat4();
    m.set4x4r(
      right.x, right.y, right.z, 0,
      up.x, up.y, up.z, 0,
      dir.x, dir.y, dir.z, 0,
      0, 0, 0, 1
    );
    q.w = Math.sqrt(1.0 + m.a11 + m.a22 + m.a33) / 2.0;
    var dfWScale = q.w * 4.0;
    q.x = ((m.a23 - m.a32) / dfWScale);
    q.y = ((m.a31 - m.a13) / dfWScale);
    q.z = ((m.a12 - m.a21) / dfWScale);
    if (debug) console.log('dir', dir);
    if (debug) console.log('up', up);
    if (debug) console.log('right', right);

    q2 = new Quat();
    q2.setAxisAngle(new Vec3(0,1,0), 180)
    q2.mul(q);
    return q2;
  }
  q.w = Math.sqrt(1.0 + m.a11 + m.a22 + m.a33) / 2.0;
  dfWScale = q.w * 4.0;
  q.x = ((m.a23 - m.a32) / dfWScale);
  q.y = ((m.a31 - m.a13) / dfWScale);
  q.z = ((m.a12 - m.a21) / dfWScale);

  this.copy(q);
  return this;
}

Quat.fromAxisAngle = function(v, a) {
  return new Quat().setAxisAngle(v, a);
}

Quat.fromDirection = function(direction) {
  return new Quat().setDirection(direction);
}


module.exports = Quat;

},{"./Mat4":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Mat4.js","./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Random.js":[function(require,module,exports){
var seedrandom = require('seedrandom');
var Vec2 = require('./Vec2');
var Vec3 = require('./Vec3');

function Random() {

}

Random.randomSeed = function(s) {
  Math.seedrandom(s);
};

Random.randomFloat = function(min, max) {
  if (typeof max == 'undefined') {
    min = 1;
  }
  if (typeof max == 'undefined') {
    max = min;
    min = 0;
  }
  return min + (max - min) * Math.random();
};

Random.randomInt = function(min, max) {
  return Math.floor(Random.randomFloat(min, max));
};

Random.randomVec3 = function(r) {
  r = r || 0.5;
  var x = 2 * Math.random() - 1;
  var y = 2 * Math.random() - 1;
  var z = 2 * Math.random() - 1;
  return Vec3.create(x * r, y * r, z * r);
};

Random.randomVec3InBoundingBox = function(bbox) {
  var x = bbox.min.x + Math.random() * (bbox.max.x - bbox.min.x);
  var y = bbox.min.y + Math.random() * (bbox.max.y - bbox.min.y);
  var z = bbox.min.z + Math.random() * (bbox.max.z - bbox.min.z);
  return Vec3.create(x, y, z);
};

Random.randomVec2InRect = function(rect) {
  return Vec2.create(rect.x + Math.random() * rect.width, rect.y + Math.random() * rect.height);
};

Random.randomChance = function(probability) {
  return Math.random() <= probability;
};

Random.randomElement = function(list) {
  return list[Math.floor(Math.random() * list.length)];
};

module.exports = Random;
},{"./Vec2":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec2.js","./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js","seedrandom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/node_modules/seedrandom/seedrandom.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Ray.js":[function(require,module,exports){
var Vec3 = require('./Vec3');

//A ray.  
//
//Consists of the starting point *origin* and the *direction* vector.  
//Used for collision detection.
//### Ray ( )
function Ray(origin, direction) {
  this.origin = origin || new Vec3(0, 0, 0);
  this.direction = direction || new Vec3(0, 0, 1);
}

//http://wiki.cgsociety.org/index.php/Ray_Sphere_Intersection
Ray.prototype.hitTestSphere = function (pos, r) {
  var hits = [];
  var d = this.direction;
  var o = this.origin;
  var osp = o.dup().sub(pos);
  var A = d.dot(d);
  if (A == 0) {
    return hits;
  }
  var B = 2 * osp.dot(d);
  var C = osp.dot(osp) - r * r;
  var sq = Math.sqrt(B * B - 4 * A * C);
  if (isNaN(sq)) {
    return hits;
  }
  var t0 = (-B - sq) / (2 * A);
  var t1 = (-B + sq) / (2 * A);
  hits.push(o.dup().add(d.dup().scale(t0)));
  if (t0 != t1) {
    hits.push(o.dup().add(d.dup().scale(t1)));
  }
  return hits;
};

//http://www.cs.princeton.edu/courses/archive/fall00/cs426/lectures/raycast/sld017.htm
//http://cgafaq.info/wiki/Ray_Plane_Intersection
Ray.prototype.hitTestPlane = function (pos, normal) {
  if (this.direction.dot(normal) == 0) {
    return [];
  }
  var t = normal.dup().scale(-1).dot(this.origin.dup().sub(pos)) / this.direction.dot(normal);
  return [this.origin.dup().add(this.direction.dup().scale(t))];
};

Ray.prototype.hitTestBoundingBox = function (bbox) {
  var hits = [];
  var self = this;
  function testFace(pos, size, normal, u, v) {
    var faceHits = self.hitTestPlane(pos, normal);
    if (faceHits.length > 0) {
      var hit = faceHits[0];
      if (hit[u] > pos[u] - size[u] / 2 && hit[u] < pos[u] + size[u] / 2 && hit[v] > pos[v] - size[v] / 2 && hit[v] < pos[v] + size[v] / 2) {
        hits.push(hit);
      }
    }
  }
  var bboxCenter = bbox.getCenter();
  var bboxSize = bbox.getSize();
  testFace(bboxCenter.dup().add(new Vec3(0, 0, bboxSize.z / 2)), bboxSize, new Vec3(0, 0, 1), 'x', 'y');
  testFace(bboxCenter.dup().add(new Vec3(0, 0, -bboxSize.z / 2)), bboxSize, new Vec3(0, 0, -1), 'x', 'y');
  testFace(bboxCenter.dup().add(new Vec3(bboxSize.x / 2, 0, 0)), bboxSize, new Vec3(1, 0, 0), 'y', 'z');
  testFace(bboxCenter.dup().add(new Vec3(-bboxSize.x / 2, 0, 0)), bboxSize, new Vec3(-1, 0, 0), 'y', 'z');
  testFace(bboxCenter.dup().add(new Vec3(0, bboxSize.y / 2, 0)), bboxSize, new Vec3(0, 1, 0), 'x', 'z');
  testFace(bboxCenter.dup().add(new Vec3(0, -bboxSize.y / 2, 0)), bboxSize, new Vec3(0, -1, 0), 'x', 'z');

  hits.forEach(function (hit) {
    hit._distance = hit.distance(self.origin);
  });

  hits.sort(function (a, b) {
    return a._distance - b._distance;
  });

  hits.forEach(function (hit) {
    delete hit._distance;
  });

  if (hits.length > 0) {
    hits = [hits[0]];
  }

  return hits;
};

module.exports = Ray;
},{"./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Rect.js":[function(require,module,exports){
function Rect(x, y, width, height) {
  this.x = x;
  this.y = y;
  this.width = width;
  this.height = height;
}

Rect.prototype.set = function(x, y, width, height) {
  this.x = x;
  this.y = y;
  this.width = width;
  this.height = height;
};

Rect.prototype.contains = function(point) {
  return point.x >= this.x && point.x <= this.x + this.width && point.y >= this.y && point.y <= this.y + this.height;
};

module.exports = Rect;
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Spline1D.js":[function(require,module,exports){
//Camtull-Rom spline implementation  
//Inspired by code from [Tween.js][1]
//[1]: http://sole.github.com/tween.js/examples/05_spline.html

//## Example use 
//
//     var points = [ 
//       -2, 
//       -1, 
//        1, 
//        2
//     ];
//
//     var spline = new Spline1D(points);
//
//     spline.getPointAt(0.25);

//## Reference

//### Spline1D ( points, [ closed ] )
//`points` - *{ Array of Vec3 }* = [ ]  
//`closed` - is the spline a closed loop? *{ Boolean }* = false
function Spline1D(points, closed) {
  this.points = points || [];
  this.dirtyLength = true;
  this.closed = closed || false;
  this.samplesCount = 2000;
}

//### getPoint ( t )
//Gets position based on t-value.
//It is fast, but resulting points will not be evenly distributed.
//
//`t` - *{ Number } <0, 1>*
Spline1D.prototype.getPoint = function ( t ) {
  if (this.closed) {
    t = (t + 1 ) % 1;
  }
  else {
    t = Math.max(0, Math.min(t, 1));
  }

  var points = this.points;
  var len = this.closed ? points.length : points.length - 1;
  var point = t * len;
  var intPoint = Math.floor( point );
  var weight = point - intPoint;

  var c0, c1, c2, c3;
  if (this.closed) {
    c0 = (intPoint - 1 + points.length ) % points.length;
    c1 = intPoint % points.length;
    c2 = (intPoint + 1 ) % points.length;
    c3 = (intPoint + 2 ) % points.length;
  }
  else {
    c0 = intPoint == 0 ? intPoint : intPoint - 1;
    c1 = intPoint;
    c2 = intPoint > points.length - 2 ? intPoint : intPoint + 1;
    c3 = intPoint > points.length - 3 ? intPoint : intPoint + 2;
  }

  return this.interpolate( points[ c0 ], points[ c1 ], points[ c2 ], points[ c3 ], weight );
}

//### addPoint ( p )
//Adds point to the spline
//
//`p` - point to be added *{ Vec3 }* 
Spline1D.prototype.addPoint = function ( p ) {
  this.dirtyLength = true;
  this.points.push(p)
}

//### getPointAt ( d )
//Gets position based on d-th of total length of the curve.
//Precise but might be slow at the first use due to need to precalculate length.
//
//`d` - *{ Number } <0, 1>*
Spline1D.prototype.getPointAt = function ( d ) {
  if (this.closed) {
    d = (d + 1 ) % 1;
  }
  else {
    d = Math.max(0, Math.min(d, 1));
  }

  if (this.dirtyLength) {
    this.precalculateLength();
  }

  //TODO: try binary search
  var k = 0;
  for(var i=0; i<this.accumulatedLengthRatios.length; i++) {
    if (this.accumulatedLengthRatios[i] > d - 1/this.samplesCount) {
      k = this.accumulatedRatios[i];
      break;
    }
  }

  return this.getPoint(k);
}

//### getPointAtIndex ( i )
//Returns position of i-th point forming the curve
//
//`i` - *{ Number } <0, Spline1D.points.length)*
Spline1D.prototype.getPointAtIndex = function ( i ) {
  if (i < this.points.length) {
    return this.points[i];
  }
  else {
    return null;
  }
}

//### getNumPoints ( )
//Return number of base points in the spline
Spline1D.prototype.getNumPoints = function() {
  return this.points.length;
}

//### getLength ( )
//Returns the total length of the spline.
Spline1D.prototype.getLength = function() {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  return this.length;
}

//### precalculateLength ( )
//Goes through all the segments of the curve and calculates total length and
//the ratio of each segment.
Spline1D.prototype.precalculateLength = function() {
  var step = 1/this.samplesCount;
  var k = 0;
  var totalLength = 0;
  this.accumulatedRatios = [];
  this.accumulatedLengthRatios = [];
  this.accumulatedLengths = [];

  var point;
  var prevPoint;
  var k = 0;
  for(var i=0; i<this.samplesCount; i++) {
    prevPoint = point;
    point = this.getPoint(k);

    if (i > 0) {
      var len = Math.sqrt(1 + (point - prevPoint)*(point - prevPoint));
      totalLength += len;
    }

    this.accumulatedRatios.push(k);
    this.accumulatedLengths.push(totalLength)

    k += step;
  }

  for(var i=0; i<this.samplesCount; i++) {
    this.accumulatedLengthRatios.push(this.accumulatedLengths[i] / totalLength);
  }

  this.length = totalLength;
  this.dirtyLength = false;
}

//### close ( )
//Closes the spline. It will form a closed now.
Spline1D.prototype.close = function( ) {
  this.closed = true;
}

//### isClosed ( )
//Returns true if spline is closed (forms a closed) *{ Boolean }*
Spline1D.prototype.isClosed = function() {
  return this.closed;
}

//### interpolate ( p0, p1, p2, p3, t)
//Helper function to calculate Catmul-Rom spline equation  
//
//`p0` - previous value *{ Number }*  
//`p1` - current value *{ Number }*  
//`p2` - next value *{ Number }*  
//`p3` - next next value *{ Number }*  
//`t` - parametric distance between p1 and p2 *{ Number } <0, 1>*
Spline1D.prototype.interpolate = function(p0, p1, p2, p3, t) {
  var v0 = ( p2 - p0 ) * 0.5;
  var v1 = ( p3 - p1 ) * 0.5;
  var t2 = t * t;
  var t3 = t * t2;
  return ( 2 * p1 - 2 * p2 + v0 + v1 ) * t3 + ( - 3 * p1 + 3 * p2 - 2 * v0 - v1 ) * t2 + v0 * t + p1;
}

module.exports = Spline1D;

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Spline2D.js":[function(require,module,exports){
//Camtull-Rom spline implementation  
//Inspired by code from [Tween.js][1]
//[1]: http://sole.github.com/tween.js/examples/05_spline.html
//## Example use 
//
//     var points = [ 
//       new Vec2(-2,  0), 
//       new Vec2(-1,  0), 
//       new Vec2( 1,  1), 
//       new Vec2( 2, -1) 
//     ];
//
//     var spline = new Spline2D(points);
//
//     spline.getPointAt(0.25);
//## Reference

var Vec2 = require('./Vec2');

//### Spline2D ( points, [ closed ] )
//`points` - *{ Array of Vec2 }* = [ ]  
//`closed` - is the spline a closed loop? *{ Boolean }* = false
function Spline2D(points, closed) {
  this.points = points || [];
  this.dirtyLength = true;
  this.closed = closed || false;
  this.samplesCount = 100;
}
//### getPoint ( t )
//Gets position based on t-value.
//It is fast, but resulting points will not be evenly distributed.
//
//`t` - *{ Number } <0, 1>*
//returns [Vec2](Vec2.html)
Spline2D.prototype.getPoint = function (t) {
  if (this.closed) {
    t = (t + 1) % 1;
  } else {
    t = Math.max(0, Math.min(t, 1));
  }
  var points = this.points;
  var len = this.closed ? points.length : points.length - 1;
  var point = t * len;
  var intPoint = Math.floor(point);
  var weight = point - intPoint;
  var c0, c1, c2, c3;
  if (this.closed) {
    c0 = (intPoint - 1 + points.length) % points.length;
    c1 = intPoint % points.length;
    c2 = (intPoint + 1) % points.length;
    c3 = (intPoint + 2) % points.length;
  } else {
    c0 = intPoint == 0 ? intPoint : intPoint - 1;
    c1 = intPoint;
    c2 = intPoint > points.length - 2 ? intPoint : intPoint + 1;
    c3 = intPoint > points.length - 3 ? intPoint : intPoint + 2;
  }
  var vec = new Vec2();
  vec.x = this.interpolate(points[c0].x, points[c1].x, points[c2].x, points[c3].x, weight);
  vec.y = this.interpolate(points[c0].y, points[c1].y, points[c2].y, points[c3].y, weight);
  return vec;
};
//### addPoint ( p )
//Adds point to the spline
//
//`p` - point to be added *{ Vec2 }* 
Spline2D.prototype.addPoint = function (p) {
  this.dirtyLength = true;
  this.points.push(p);
};
//### getPointAt ( d )
//Gets position based on d-th of total length of the curve.
//Precise but might be slow at the first use due to need to precalculate length.
//
//`d` - *{ Number } <0, 1>*
Spline2D.prototype.getPointAt = function (d) {
  if (this.closed) {
    d = (d + 1) % 1;
  } else {
    d = Math.max(0, Math.min(d, 1));
  }
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  //TODO: try binary search
  var k = 0;
  for (var i = 0; i < this.accumulatedLengthRatios.length; i++) {
    if (this.accumulatedLengthRatios[i] > d - 1/this.samplesCount) {
      k = this.accumulatedRatios[i];
      break;
    }
  }
  return this.getPoint(k);
};

//naive implementation
Spline2D.prototype.getClosestPoint = function(point) {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  var closesPoint = this.precalculatedPoints.reduce(function(best, p) {
    var dist = point.squareDistance(p);
    if (dist < best.dist) {
      return { dist: dist, point: p };
    }
    else return best;
  }, { dist: Infinity, point: null });
  return closesPoint.point;
}

Spline2D.prototype.getClosestPointRatio = function(point) {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  var closesPoint = this.precalculatedPoints.reduce(function(best, p, pIndex) {
    var dist = point.squareDistance(p);
    if (dist < best.dist) {
      return { dist: dist, point: p, index: pIndex };
    }
    else return best;
  }, { dist: Infinity, point: null, index: -1 });
  return this.accumulatedLengthRatios[closesPoint.index];
}

//### getPointAtIndex ( i )
//Returns position of i-th point forming the curve
//
//`i` - *{ Number } <0, Spline2D.points.length)*
Spline2D.prototype.getPointAtIndex = function (i) {
  if (i < this.points.length) {
    return this.points[i];
  } else {
    return null;
  }
};
//### getNumPoints ( )
//Return number of base points in the spline
Spline2D.prototype.getNumPoints = function () {
  return this.points.length;
};
//### getLength ( )
//Returns the total length of the spline.
Spline2D.prototype.getLength = function () {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  return this.length;
};
//### precalculateLength ( )
//Goes through all the segments of the curve and calculates total length and
//the ratio of each segment.
Spline2D.prototype.precalculateLength = function () {
  var step = 1 / this.samplesCount;
  var k = 0;
  var totalLength = 0;
  this.accumulatedRatios = [];
  this.accumulatedLengthRatios = [];
  this.accumulatedLengths = [];
  this.precalculatedPoints = [];
  var point;
  var prevPoint;
  for (var i = 0; i < this.samplesCount; i++) {
    prevPoint = point;
    point = this.getPoint(k);
    if (i > 0) {
      var len = point.dup().sub(prevPoint).length();
      totalLength += len;
    }
    this.accumulatedRatios.push(k);
    this.accumulatedLengths.push(totalLength);
    this.precalculatedPoints.push(point);
    k += step;
  }
  for (var i = 0; i < this.samplesCount; i++) {
    this.accumulatedLengthRatios.push(this.accumulatedLengths[i] / totalLength);
  }
  this.length = totalLength;
  this.dirtyLength = false;
};
//### close ( )
//Closes the spline. It will form a closed now.
Spline2D.prototype.close = function () {
  this.closed = true;
};
//### isClosed ( )
//Returns true if spline is closed (forms a closed) *{ Boolean }*
Spline2D.prototype.isClosed = function () {
  return this.closed;
};
//### interpolate ( p0, p1, p2, p3, t)
//Helper function to calculate Catmul-Rom spline equation  
//
//`p0` - previous value *{ Number }*  
//`p1` - current value *{ Number }*  
//`p2` - next value *{ Number }*  
//`p3` - next next value *{ Number }*  
//`t` - parametric distance between p1 and p2 *{ Number } <0, 1>*
Spline2D.prototype.interpolate = function (p0, p1, p2, p3, t) {
  var v0 = (p2 - p0) * 0.5;
  var v1 = (p3 - p1) * 0.5;
  var t2 = t * t;
  var t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
};

module.exports = Spline2D;
},{"./Vec2":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec2.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Spline3D.js":[function(require,module,exports){
//Camtull-Rom spline implementation  
//Inspired by code from [Tween.js][1]
//[1]: http://sole.github.com/tween.js/examples/05_spline.html
//## Example use 
//
//     var points = [ 
//       new Vec3(-2,  0, 0), 
//       new Vec3(-1,  0, 0), 
//       new Vec3( 1,  1, 0), 
//       new Vec3( 2, -1, 0) 
//     ];
//
//     var spline = new Spline3D(points);
//
//     spline.getPointAt(0.25);
//## Reference

var Vec3 = require('./Vec3');

//### Spline3D ( points, [ closed ] )
//`points` - *{ Array of Vec3 }* = [ ]  
//`closed` - is the spline a closed loop? *{ Boolean }* = false
function Spline3D(points, closed) {
  this.points = points || [];
  this.dirtyLength = true;
  this.closed = closed || false;
  this.samplesCount = 1000;
}
//### getPoint ( t )
//Gets position based on t-value.
//It is fast, but resulting points will not be evenly distributed.
//
//`t` - *{ Number } <0, 1>*
//returns [Vec3](Vec3.html)
Spline3D.prototype.getPoint = function (t) {
  if (this.closed) {
    t = (t + 1) % 1;
  } else {
    t = Math.max(0, Math.min(t, 1));
  }
  var points = this.points;
  var len = this.closed ? points.length : points.length - 1;
  var point = t * len;
  var intPoint = Math.floor(point);
  var weight = point - intPoint;
  var c0, c1, c2, c3;
  if (this.closed) {
    c0 = (intPoint - 1 + points.length) % points.length;
    c1 = intPoint % points.length;
    c2 = (intPoint + 1) % points.length;
    c3 = (intPoint + 2) % points.length;
  } else {
    c0 = intPoint == 0 ? intPoint : intPoint - 1;
    c1 = intPoint;
    c2 = intPoint > points.length - 2 ? intPoint : intPoint + 1;
    c3 = intPoint > points.length - 3 ? intPoint : intPoint + 2;
  }
  var vec = new Vec3();
  vec.x = this.interpolate(points[c0].x, points[c1].x, points[c2].x, points[c3].x, weight);
  vec.y = this.interpolate(points[c0].y, points[c1].y, points[c2].y, points[c3].y, weight);
  vec.z = this.interpolate(points[c0].z, points[c1].z, points[c2].z, points[c3].z, weight);
  return vec;
};
//### addPoint ( p )
//Adds point to the spline
//
//`p` - point to be added *{ Vec3 }* 
Spline3D.prototype.addPoint = function (p) {
  this.dirtyLength = true;
  this.points.push(p);
};
//### getPointAt ( d )
//Gets position based on d-th of total length of the curve.
//Precise but might be slow at the first use due to need to precalculate length.
//
//`d` - *{ Number } <0, 1>*
Spline3D.prototype.getPointAt = function (d) {
  if (this.closed) {
    d = (d + 1) % 1;
  } else {
    d = Math.max(0, Math.min(d, 1));
  }
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  //TODO: try binary search
  var k = 0;
  for (var i = 0; i < this.accumulatedLengthRatios.length; i++) {
    if (this.accumulatedLengthRatios[i] > d - 1/this.samplesCount) {
      k = this.accumulatedRatios[i];
      break;
    }
  }
  return this.getPoint(k);
};

//naive implementation
Spline3D.prototype.getClosestPoint = function(point) {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  var closesPoint = this.precalculatedPoints.reduce(function(best, p) {
    var dist = point.squareDistance(p);
    if (dist < best.dist) {
      return { dist: dist, point: p };
    }
    else return best;
  }, { dist: Infinity, point: null });
  return closesPoint.point;
}

Spline3D.prototype.getClosestPointRatio = function(point) {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  var closesPoint = this.precalculatedPoints.reduce(function(best, p, pIndex) {
    var dist = point.squareDistance(p);
    if (dist < best.dist) {
      return { dist: dist, point: p, index: pIndex };
    }
    else return best;
  }, { dist: Infinity, point: null, index: -1 });
  return this.accumulatedLengthRatios[closesPoint.index];
}

//### getTangentAt ( t )
Spline3D.prototype.getTangentAt = function(t) {
  var currT = (t < 0.99) ? t : t - 0.01;
  var nextT  = (t < 0.99) ? t + 0.01 : t;
  var p = this.getPointAt(currT);
  var np = this.getPointAt(nextT);
  return Vec3.create().asSub(np, p).normalize();
};
//### getPointAtIndex ( i )
//Returns position of i-th point forming the curve
//
//`i` - *{ Number } <0, Spline3D.points.length)*
Spline3D.prototype.getPointAtIndex = function (i) {
  if (i < this.points.length) {
    return this.points[i];
  } else {
    return null;
  }
};
//### getNumPoints ( )
//Return number of base points in the spline
Spline3D.prototype.getNumPoints = function () {
  return this.points.length;
};
//### getLength ( )
//Returns the total length of the spline.
Spline3D.prototype.getLength = function () {
  if (this.dirtyLength) {
    this.precalculateLength();
  }
  return this.length;
};
//### precalculateLength ( )
//Goes through all the segments of the curve and calculates total length and
//the ratio of each segment.
Spline3D.prototype.precalculateLength = function () {
  var step = 1 / this.samplesCount;
  var k = 0;
  var totalLength = 0;
  this.accumulatedRatios = [];
  this.accumulatedLengthRatios = [];
  this.accumulatedLengths = [];
  this.precalculatedPoints = [];
  var point;
  var prevPoint;
  for (var i = 0; i < this.samplesCount; i++) {
    prevPoint = point;
    point = this.getPoint(k);
    if (i > 0) {
      var len = point.dup().sub(prevPoint).length();
      totalLength += len;
    }
    this.accumulatedRatios.push(k);
    this.accumulatedLengths.push(totalLength);
    this.precalculatedPoints.push(point);
    k += step;
  }
  for (var i = 0; i < this.samplesCount; i++) {
    this.accumulatedLengthRatios.push(this.accumulatedLengths[i] / totalLength);
  }
  this.length = totalLength;
  this.dirtyLength = false;
};
//### close ( )
//Closes the spline. It will form a closed now.
Spline3D.prototype.close = function () {
  this.closed = true;
};
//### isClosed ( )
//Returns true if spline is closed (forms a closed) *{ Boolean }*
Spline3D.prototype.isClosed = function () {
  return this.closed;
};
//### interpolate ( p0, p1, p2, p3, t)
//Helper function to calculate Catmul-Rom spline equation  
//
//`p0` - previous value *{ Number }*  
//`p1` - current value *{ Number }*  
//`p2` - next value *{ Number }*  
//`p3` - next next value *{ Number }*  
//`t` - parametric distance between p1 and p2 *{ Number } <0, 1>*
Spline3D.prototype.interpolate = function (p0, p1, p2, p3, t) {
  var v0 = (p2 - p0) * 0.5;
  var v1 = (p3 - p1) * 0.5;
  var t2 = t * t;
  var t3 = t * t2;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
};

module.exports = Spline3D;
},{"./Vec3":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Triangle2D.js":[function(require,module,exports){
function sign(a, b, c) {
  return (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y);
}

function Triangle2D(a, b, c) {
  this.a = a;
  this.b = b;
  this.c = c;
}

//http://stackoverflow.com/a/2049593
//doesn't properly handle points on the edge of the triangle
Triangle2D.prototype.contains = function (p) {
  var signAB = sign(this.a, this.b, p) < 0;
  var signBC = sign(this.b, this.c, p) < 0;
  var signCA = sign(this.c, this.a, p) < 0;
  return signAB == signBC && signBC == signCA;
};

module.exports = Triangle2D;
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec2.js":[function(require,module,exports){
function Vec2(x, y) {
  this.x = x != null ? x : 0;
  this.y = y != null ? y : 0;
}

Vec2.create = function(x, y) {
  return new Vec2(x, y);
};

Vec2.prototype.set = function(x, y) {
  this.x = x;
  this.y = y;
  return this;
};

Vec2.prototype.equals = function(v, tolerance) {
  if (tolerance == null) {
    tolerance = 0.0000001;
  }
  return (Math.abs(v.x - this.x) <= tolerance) && (Math.abs(v.y - this.y) <= tolerance);
};

Vec2.prototype.hash = function() {
  return 1 * this.x + 12 * this.y;
};

Vec2.prototype.setVec2 = function(v) {
  this.x = v.x;
  this.y = v.y;
  return this;
};

Vec2.prototype.add = function(v) {
  this.x += v.x;
  this.y += v.y;
  return this;
};

Vec2.prototype.sub = function(v) {
  this.x -= v.x;
  this.y -= v.y;
  return this;
};

Vec2.prototype.scale = function(f) {
  this.x *= f;
  this.y *= f;
  return this;
};

Vec2.prototype.distance = function(v) {
  var dx = v.x - this.x;
  var dy = v.y - this.y;
  return Math.sqrt(dx * dx + dy * dy);
};

Vec2.prototype.squareDistance = function(v) {
  var dx = v.x - this.x;
  var dy = v.y - this.y;
  return dx * dx + dy * dy;
};

Vec2.prototype.dot = function(b) {
  return this.x * b.x + this.y * b.y;
};

Vec2.prototype.copy = function(v) {
  this.x = v.x;
  this.y = v.y;
  return this;
};

Vec2.prototype.clone = function() {
  return new Vec2(this.x, this.y);
};

Vec2.prototype.dup = function() {
  return this.clone();
};

Vec2.prototype.asAdd = function(a, b) {
  this.x = a.x + b.x;
  this.y = a.y + b.y;
  return this;
};

Vec2.prototype.asSub = function(a, b) {
  this.x = a.x - b.x;
  this.y = a.y - b.y;
  return this;
};

Vec2.prototype.length = function() {
  return Math.sqrt(this.x * this.x + this.y * this.y);
};

Vec2.prototype.normalize = function() {
  var len = this.length();
  if (len > 0) {
    this.scale(1 / len);
  }
  return this;
};

Vec2.prototype.toString = function() {
  return "{" + Math.floor(this.x*1000)/1000 + ", " + Math.floor(this.y*1000)/1000 + "}";
};

module.exports = Vec2;

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec3.js":[function(require,module,exports){
function Vec3(x, y, z) {
  this.x = x != null ? x : 0;
  this.y = y != null ? y : 0;
  this.z = z != null ? z : 0;
}

Vec3.create = function(x, y, z) {
  return new Vec3(x, y, z);
};

Vec3.prototype.hash = function() {
  return 1 * this.x + 12 * this.y + 123 * this.z;
};

Vec3.prototype.set = function(x, y, z) {
  this.x = x;
  this.y = y;
  this.z = z;
  return this;
};

Vec3.prototype.add = function(v) {
  this.x += v.x;
  this.y += v.y;
  this.z += v.z;
  return this;
};

Vec3.prototype.sub = function(v) {
  this.x -= v.x;
  this.y -= v.y;
  this.z -= v.z;
  return this;
};

Vec3.prototype.scale = function(f) {
  this.x *= f;
  this.y *= f;
  this.z *= f;
  return this;
};

Vec3.prototype.distance = function(v) {
  var dx = v.x - this.x;
  var dy = v.y - this.y;
  var dz = v.z - this.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

Vec3.prototype.squareDistance = function(v) {
  var dx = v.x - this.x;
  var dy = v.y - this.y;
  var dz = v.z - this.z;
  return dx * dx + dy * dy + dz * dz;
};

Vec3.prototype.copy = function(v) {
  this.x = v.x;
  this.y = v.y;
  this.z = v.z;
  return this;
};

Vec3.prototype.setVec3 = function(v) {
  this.x = v.x;
  this.y = v.y;
  this.z = v.z;
  return this;
};

Vec3.prototype.clone = function() {
  return new Vec3(this.x, this.y, this.z);
};

Vec3.prototype.dup = function() {
  return this.clone();
};

Vec3.prototype.cross = function(v) {
  var x = this.x;
  var y = this.y;
  var z = this.z;
  var vx = v.x;
  var vy = v.y;
  var vz = v.z;
  this.x = y * vz - z * vy;
  this.y = z * vx - x * vz;
  this.z = x * vy - y * vx;
  return this;
};

Vec3.prototype.dot = function(b) {
  return this.x * b.x + this.y * b.y + this.z * b.z;
};

Vec3.prototype.asAdd = function(a, b) {
  this.x = a.x + b.x;
  this.y = a.y + b.y;
  this.z = a.z + b.z;
  return this;
};

Vec3.prototype.asSub = function(a, b) {
  this.x = a.x - b.x;
  this.y = a.y - b.y;
  this.z = a.z - b.z;
  return this;
};

Vec3.prototype.asCross = function(a, b) {
  return this.copy(a).cross(b);
};

Vec3.prototype.addScaled = function(a, f) {
  this.x += a.x * f;
  this.y += a.y * f;
  this.z += a.z * f;
  return this;
};

Vec3.prototype.length = function() {
  return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
};

Vec3.prototype.lengthSquared = function() {
  return this.x * this.x + this.y * this.y + this.z * this.z;
};

Vec3.prototype.normalize = function() {
  var len = this.length();
  if (len > 0) {
    this.scale(1 / len);
  }
  return this;
};

Vec3.prototype.transformQuat = function(q) {
  var x = this.x;
  var y = this.y;
  var z = this.z;
  var qx = q.x;
  var qy = q.y;
  var qz = q.z;
  var qw = q.w;
  var ix = qw * x + qy * z - qz * y;
  var iy = qw * y + qz * x - qx * z;
  var iz = qw * z + qx * y - qy * x;
  var iw = -qx * x - qy * y - qz * z;
  this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return this;
};

Vec3.prototype.transformMat4 = function(m) {
  var x = m.a14 + m.a11 * this.x + m.a12 * this.y + m.a13 * this.z;
  var y = m.a24 + m.a21 * this.x + m.a22 * this.y + m.a23 * this.z;
  var z = m.a34 + m.a31 * this.x + m.a32 * this.y + m.a33 * this.z;
  this.x = x;
  this.y = y;
  this.z = z;
  return this;
};

Vec3.prototype.equals = function(v, tolerance) {
  tolerance = tolerance != null ? tolerance : 0.0000001;
  return (Math.abs(v.x - this.x) <= tolerance) && (Math.abs(v.y - this.y) <= tolerance) && (Math.abs(v.z - this.z) <= tolerance);
};

Vec3.prototype.toString = function() {
  return "{" + Math.floor(this.x*1000)/1000 + ", " + Math.floor(this.y*1000)/1000 + ", " + Math.floor(this.z*1000)/1000 + "}";
};

Vec3.Zero = new Vec3(0, 0, 0);

module.exports = Vec3;

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/lib/Vec4.js":[function(require,module,exports){
function Vec4(x, y, z, w) {
  this.x = x != null ? x : 0;
  this.y = y != null ? y : 0;
  this.z = z != null ? z : 0;
  this.w = w != null ? w : 0;
}

Vec4.prototype.equals = function(v, tolerance) {
  if (tolerance == null) {
    tolerance = 0.0000001;
  }
  return (Math.abs(v.x - this.x) <= tolerance) && (Math.abs(v.y - this.y) <= tolerance) && (Math.abs(v.z - this.z) <= tolerance) && (Math.abs(v.w - this.w) <= tolerance);
};

Vec4.prototype.hash = function() {
  return 1 * this.x + 12 * this.y + 123 * this.z + 1234 * this.w;
};

Vec4.create = function(x, y, z, w) {
  return new Vec4(x, y, z, w);
};

Vec4.prototype.set = function(x, y, z, w) {
  this.x = x;
  this.y = y;
  this.z = z;
  this.w = w;
  return this;
};

Vec4.prototype.setVec4 = function(v) {
  this.x = v.x;
  this.y = v.y;
  this.z = v.z;
  this.w = v.w;
  return this;
};

Vec4.prototype.transformMat4 = function(m) {
  var x = m.a14 * this.w + m.a11 * this.x + m.a12 * this.y + m.a13 * this.z;
  var y = m.a24 * this.w + m.a21 * this.x + m.a22 * this.y + m.a23 * this.z;
  var z = m.a34 * this.w + m.a31 * this.x + m.a32 * this.y + m.a33 * this.z;
  var w = m.a44 * this.w + m.a41 * this.x + m.a42 * this.y + m.a43 * this.z;
  this.x = x;
  this.y = y;
  this.z = z;
  this.w = w;
  return this;
};

Vec4.prototype.toString = function() {
  return "{" + Math.floor(this.x*1000)/1000 + ", " + Math.floor(this.y*1000)/1000 + ", " + Math.floor(this.z*1000)/1000 + ", " + Math.floor(this.w*1000)/1000 + "}";
};

module.exports = Vec4;

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/node_modules/seedrandom/seedrandom.js":[function(require,module,exports){
// seedrandom.js version 2.3.4
// Author: David Bau
// Date: 2014 Mar 9
//
// Defines a method Math.seedrandom() that, when called, substitutes
// an explicitly seeded RC4-based algorithm for Math.random().  Also
// supports automatic seeding from local or network sources of entropy.
// Can be used as a node.js or AMD module.  Can be called with "new"
// to create a local PRNG without changing Math.random.
//
// Basic usage:
//
//   <script src=http://davidbau.com/encode/seedrandom.min.js></script>
//
//   Math.seedrandom('yay.');  // Sets Math.random to a function that is
//                             // initialized using the given explicit seed.
//
//   Math.seedrandom();        // Sets Math.random to a function that is
//                             // seeded using the current time, dom state,
//                             // and other accumulated local entropy.
//                             // The generated seed string is returned.
//
//   Math.seedrandom('yowza.', true);
//                             // Seeds using the given explicit seed mixed
//                             // together with accumulated entropy.
//
//   <script src="https://jsonlib.appspot.com/urandom?callback=Math.seedrandom">
//   </script>                 <!-- Seeds using urandom bits from a server. -->
//
//   Math.seedrandom("hello.");           // Behavior is the same everywhere:
//   document.write(Math.random());       // Always 0.9282578795792454
//   document.write(Math.random());       // Always 0.3752569768646784
//
// Math.seedrandom can be used as a constructor to return a seeded PRNG
// that is independent of Math.random:
//
//   var myrng = new Math.seedrandom('yay.');
//   var n = myrng();          // Using "new" creates a local prng without
//                             // altering Math.random.
//
// When used as a module, seedrandom is a function that returns a seeded
// PRNG instance without altering Math.random:
//
//   // With node.js (after "npm install seedrandom"):
//   var seedrandom = require('seedrandom');
//   var rng = seedrandom('hello.');
//   console.log(rng());                  // always 0.9282578795792454
//
//   // With require.js or other AMD loader:
//   require(['seedrandom'], function(seedrandom) {
//     var rng = seedrandom('hello.');
//     console.log(rng());                // always 0.9282578795792454
//   });
//
// More examples:
//
//   var seed = Math.seedrandom();        // Use prng with an automatic seed.
//   document.write(Math.random());       // Pretty much unpredictable x.
//
//   var rng = new Math.seedrandom(seed); // A new prng with the same seed.
//   document.write(rng());               // Repeat the 'unpredictable' x.
//
//   function reseed(event, count) {      // Define a custom entropy collector.
//     var t = [];
//     function w(e) {
//       t.push([e.pageX, e.pageY, +new Date]);
//       if (t.length < count) { return; }
//       document.removeEventListener(event, w);
//       Math.seedrandom(t, true);        // Mix in any previous entropy.
//     }
//     document.addEventListener(event, w);
//   }
//   reseed('mousemove', 100);            // Reseed after 100 mouse moves.
//
// The callback third arg can be used to get both the prng and the seed.
// The following returns both an autoseeded prng and the seed as an object,
// without mutating Math.random:
//
//   var obj = Math.seedrandom(null, false, function(prng, seed) {
//     return { random: prng, seed: seed };
//   });
//
// Version notes:
//
// The random number sequence is the same as version 1.0 for string seeds.
// * Version 2.0 changed the sequence for non-string seeds.
// * Version 2.1 speeds seeding and uses window.crypto to autoseed if present.
// * Version 2.2 alters non-crypto autoseeding to sweep up entropy from plugins.
// * Version 2.3 adds support for "new", module loading, and a null seed arg.
// * Version 2.3.1 adds a build environment, module packaging, and tests.
// * Version 2.3.3 fixes bugs on IE8, and switches to MIT license.
// * Version 2.3.4 fixes documentation to contain the MIT license.
//
// The standard ARC4 key scheduler cycles short keys, which means that
// seedrandom('ab') is equivalent to seedrandom('abab') and 'ababab'.
// Therefore it is a good idea to add a terminator to avoid trivial
// equivalences on short string seeds, e.g., Math.seedrandom(str + '\0').
// Starting with version 2.0, a terminator is added automatically for
// non-string seeds, so seeding with the number 111 is the same as seeding
// with '111\0'.
//
// When seedrandom() is called with zero args or a null seed, it uses a
// seed drawn from the browser crypto object if present.  If there is no
// crypto support, seedrandom() uses the current time, the native rng,
// and a walk of several DOM objects to collect a few bits of entropy.
//
// Each time the one- or two-argument forms of seedrandom are called,
// entropy from the passed seed is accumulated in a pool to help generate
// future seeds for the zero- and two-argument forms of seedrandom.
//
// On speed - This javascript implementation of Math.random() is several
// times slower than the built-in Math.random() because it is not native
// code, but that is typically fast enough.  Some details (timings on
// Chrome 25 on a 2010 vintage macbook):
//
// seeded Math.random()          - avg less than 0.0002 milliseconds per call
// seedrandom('explicit.')       - avg less than 0.2 milliseconds per call
// seedrandom('explicit.', true) - avg less than 0.2 milliseconds per call
// seedrandom() with crypto      - avg less than 0.2 milliseconds per call
//
// Autoseeding without crypto is somewhat slower, about 20-30 milliseconds on
// a 2012 windows 7 1.5ghz i5 laptop, as seen on Firefox 19, IE 10, and Opera.
// Seeded rng calls themselves are fast across these browsers, with slowest
// numbers on Opera at about 0.0005 ms per seeded Math.random().
//
// LICENSE (MIT):
//
// Copyright (c)2014 David Bau.
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//

/**
 * All code is in an anonymous closure to keep the global namespace clean.
 */
(function (
    global, pool, math, width, chunks, digits, module, define, rngname) {

//
// The following constants are related to IEEE 754 limits.
//
var startdenom = math.pow(width, chunks),
    significance = math.pow(2, digits),
    overflow = significance * 2,
    mask = width - 1,

//
// seedrandom()
// This is the seedrandom function described above.
//
impl = math['seed' + rngname] = function(seed, use_entropy, callback) {
  var key = [];

  // Flatten the seed string or build one from local entropy if needed.
  var shortseed = mixkey(flatten(
    use_entropy ? [seed, tostring(pool)] :
    (seed == null) ? autoseed() : seed, 3), key);

  // Use the seed to initialize an ARC4 generator.
  var arc4 = new ARC4(key);

  // Mix the randomness into accumulated entropy.
  mixkey(tostring(arc4.S), pool);

  // Calling convention: what to return as a function of prng, seed, is_math.
  return (callback ||
      // If called as a method of Math (Math.seedrandom()), mutate Math.random
      // because that is how seedrandom.js has worked since v1.0.  Otherwise,
      // it is a newer calling convention, so return the prng directly.
      function(prng, seed, is_math_call) {
        if (is_math_call) { math[rngname] = prng; return seed; }
        else return prng;
      })(

  // This function returns a random double in [0, 1) that contains
  // randomness in every bit of the mantissa of the IEEE 754 value.
  function() {
    var n = arc4.g(chunks),             // Start with a numerator n < 2 ^ 48
        d = startdenom,                 //   and denominator d = 2 ^ 48.
        x = 0;                          //   and no 'extra last byte'.
    while (n < significance) {          // Fill up all significant digits by
      n = (n + x) * width;              //   shifting numerator and
      d *= width;                       //   denominator and generating a
      x = arc4.g(1);                    //   new least-significant-byte.
    }
    while (n >= overflow) {             // To avoid rounding up, before adding
      n /= 2;                           //   last byte, shift everything
      d /= 2;                           //   right using integer math until
      x >>>= 1;                         //   we have exactly the desired bits.
    }
    return (n + x) / d;                 // Form the number within [0, 1).
  }, shortseed, this == math);
};

//
// ARC4
//
// An ARC4 implementation.  The constructor takes a key in the form of
// an array of at most (width) integers that should be 0 <= x < (width).
//
// The g(count) method returns a pseudorandom integer that concatenates
// the next (count) outputs from ARC4.  Its return value is a number x
// that is in the range 0 <= x < (width ^ count).
//
/** @constructor */
function ARC4(key) {
  var t, keylen = key.length,
      me = this, i = 0, j = me.i = me.j = 0, s = me.S = [];

  // The empty key [] is treated as [0].
  if (!keylen) { key = [keylen++]; }

  // Set up S using the standard key scheduling algorithm.
  while (i < width) {
    s[i] = i++;
  }
  for (i = 0; i < width; i++) {
    s[i] = s[j = mask & (j + key[i % keylen] + (t = s[i]))];
    s[j] = t;
  }

  // The "g" method returns the next (count) outputs as one number.
  (me.g = function(count) {
    // Using instance members instead of closure state nearly doubles speed.
    var t, r = 0,
        i = me.i, j = me.j, s = me.S;
    while (count--) {
      t = s[i = mask & (i + 1)];
      r = r * width + s[mask & ((s[i] = s[j = mask & (j + t)]) + (s[j] = t))];
    }
    me.i = i; me.j = j;
    return r;
    // For robust unpredictability discard an initial batch of values.
    // See http://www.rsa.com/rsalabs/node.asp?id=2009
  })(width);
}

//
// flatten()
// Converts an object tree to nested arrays of strings.
//
function flatten(obj, depth) {
  var result = [], typ = (typeof obj), prop;
  if (depth && typ == 'object') {
    for (prop in obj) {
      try { result.push(flatten(obj[prop], depth - 1)); } catch (e) {}
    }
  }
  return (result.length ? result : typ == 'string' ? obj : obj + '\0');
}

//
// mixkey()
// Mixes a string seed into a key that is an array of integers, and
// returns a shortened string seed that is equivalent to the result key.
//
function mixkey(seed, key) {
  var stringseed = seed + '', smear, j = 0;
  while (j < stringseed.length) {
    key[mask & j] =
      mask & ((smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++));
  }
  return tostring(key);
}

//
// autoseed()
// Returns an object for autoseeding, using window.crypto if available.
//
/** @param {Uint8Array|Navigator=} seed */
function autoseed(seed) {
  try {
    global.crypto.getRandomValues(seed = new Uint8Array(width));
    return tostring(seed);
  } catch (e) {
    return [+new Date, global, (seed = global.navigator) && seed.plugins,
            global.screen, tostring(pool)];
  }
}

//
// tostring()
// Converts an array of charcodes to a string
//
function tostring(a) {
  return String.fromCharCode.apply(0, a);
}

//
// When seedrandom.js is loaded, we immediately mix a few bits
// from the built-in RNG into the entropy pool.  Because we do
// not want to intefere with determinstic PRNG state later,
// seedrandom will not call math.random on its own again after
// initialization.
//
mixkey(math[rngname](), pool);

//
// Nodejs and AMD support: export the implemenation as a module using
// either convention.
//
if (module && module.exports) {
  module.exports = impl;
} else if (define && define.amd) {
  define(function() { return impl; });
}

// End anonymous scope, and pass initial values.
})(
  this,   // global window object
  [],     // pool: entropy pool starts empty
  Math,   // math: package containing random, pow, and seedrandom
  256,    // width: each RC4 output is 0 <= x < 256
  6,      // chunks: at least six RC4 outputs for each double
  52,     // digits: there are 52 significant digits in a double
  (typeof module) == 'object' && module,    // present in node.js
  (typeof define) == 'function' && define,  // present with an AMD loader
  'random'// rngname: name for Math.random and Math.seedrandom
);

},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js":[function(require,module,exports){
module.exports.Context = require('./lib/Context');
module.exports.Texture = require('./lib/Texture');
module.exports.Texture2D = require('./lib/Texture2D');
module.exports.TextureCube = require('./lib/TextureCube');
module.exports.Program = require('./lib/Program');
module.exports.Material = require('./lib/Material');
module.exports.Mesh = require('./lib/Mesh');
module.exports.OrthographicCamera = require('./lib/OrthographicCamera');
module.exports.PerspectiveCamera = require('./lib/PerspectiveCamera');
module.exports.Arcball = require('./lib/Arcball');
module.exports.ScreenImage = require('./lib/ScreenImage');
module.exports.RenderTarget = require('./lib/RenderTarget');

//export all functions from Utils to module exports
var Utils = require('./lib/Utils');
for(var funcName in Utils) {
  module.exports[funcName] = Utils[funcName];
}


},{"./lib/Arcball":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Arcball.js","./lib/Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","./lib/Material":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Material.js","./lib/Mesh":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Mesh.js","./lib/OrthographicCamera":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/OrthographicCamera.js","./lib/PerspectiveCamera":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/PerspectiveCamera.js","./lib/Program":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Program.js","./lib/RenderTarget":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/RenderTarget.js","./lib/ScreenImage":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/ScreenImage.js","./lib/Texture":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Texture.js","./lib/Texture2D":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Texture2D.js","./lib/TextureCube":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/TextureCube.js","./lib/Utils":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Utils.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Arcball.js":[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var Arcball, Mat4, Plane, Quat, Vec2, Vec3, Vec4, _ref;

_ref = require('pex-geom'), Vec2 = _ref.Vec2, Vec3 = _ref.Vec3, Vec4 = _ref.Vec4, Quat = _ref.Quat, Mat4 = _ref.Mat4, Plane = _ref.Plane;

Arcball = (function() {
  function Arcball(window, camera, distance) {
    this.camera = camera;
    this.window = window;
    this.radius = Math.min(window.width / 2, window.height / 2) * 2;
    this.center = Vec2.create(window.width / 2, window.height / 2);
    this.currRot = Quat.create();
    this.currRot.setAxisAngle(Vec3.create(0, 1, 0), 0);
    this.clickRot = Quat.create();
    this.dragRot = Quat.create();
    this.clickPos = Vec3.create();
    this.clickPosWindow = Vec2.create();
    this.dragPos = Vec3.create();
    this.dragPosWindow = Vec2.create();
    this.rotAxis = Vec3.create();
    this.allowZooming = true;
    this.enabled = true;
    this.clickTarget = Vec3.create(0, 0, 0);
    this.setDistance(distance || 2);
    this.updateCamera();
    this.addEventHanlders();
  }

  Arcball.prototype.setTarget = function(target) {
    this.camera.setTarget(target);
    return this.updateCamera();
  };

  Arcball.prototype.setOrientation = function(dir) {
    this.currRot.setDirection(dir);
    this.currRot.w *= -1;
    this.updateCamera();
    return this;
  };

  Arcball.prototype.setPosition = function(pos) {
    var dir;
    dir = Vec3.create().asSub(pos, this.camera.getTarget());
    this.setOrientation(dir.dup().normalize());
    this.setDistance(dir.length());
    return this.updateCamera();
  };

  Arcball.prototype.addEventHanlders = function() {
    this.window.on('leftMouseDown', (function(_this) {
      return function(e) {
        if (e.handled || !_this.enabled) {
          return;
        }
        return _this.down(e.x, e.y, e.shift);
      };
    })(this));
    this.window.on('leftMouseUp', (function(_this) {
      return function(e) {
        return _this.up(e.x, e.y, e.shift);
      };
    })(this));
    this.window.on('mouseDragged', (function(_this) {
      return function(e) {
        if (e.handled || !_this.enabled) {
          return;
        }
        return _this.drag(e.x, e.y, e.shift);
      };
    })(this));
    return this.window.on('scrollWheel', (function(_this) {
      return function(e) {
        if (e.handled || !_this.enabled) {
          return;
        }
        if (!_this.allowZooming) {
          return;
        }
        _this.distance = Math.min(_this.maxDistance, Math.max(_this.distance + e.dy / 100 * (_this.maxDistance - _this.minDistance), _this.minDistance));
        return _this.updateCamera();
      };
    })(this));
  };

  Arcball.prototype.mouseToSphere = function(x, y) {
    var dist, v;
    y = this.window.height - y;
    v = Vec3.create((x - this.center.x) / this.radius, (y - this.center.y) / this.radius, 0);
    dist = v.x * v.x + v.y * v.y;
    if (dist > 1) {
      v.normalize();
    } else {
      v.z = Math.sqrt(1.0 - dist);
    }
    return v;
  };

  Arcball.prototype.down = function(x, y, shift) {
    var target, targetInViewSpace;
    this.dragging = true;
    this.clickPos = this.mouseToSphere(x, y);
    this.clickRot.copy(this.currRot);
    this.updateCamera();
    if (shift) {
      this.clickPosWindow.set(x, y);
      target = this.camera.getTarget();
      this.clickTarget = target.dup();
      targetInViewSpace = target.dup().transformMat4(this.camera.getViewMatrix());
      this.panPlane = new Plane(targetInViewSpace, new Vec3(0, 0, 1));
      this.clickPosPlane = this.panPlane.intersectRay(this.camera.getViewRay(this.clickPosWindow.x, this.clickPosWindow.y, this.window.width, this.window.height));
      return this.dragPosPlane = this.panPlane.intersectRay(this.camera.getViewRay(this.dragPosWindow.x, this.dragPosWindow.y, this.window.width, this.window.height));
    } else {
      return this.panPlane = null;
    }
  };

  Arcball.prototype.up = function(x, y, shift) {
    this.dragging = false;
    return this.panPlane = null;
  };

  Arcball.prototype.drag = function(x, y, shift) {
    var invViewMatrix, theta;
    if (!this.dragging) {
      return;
    }
    if (shift && this.panPlane) {
      this.dragPosWindow.set(x, y);
      this.clickPosPlane = this.panPlane.intersectRay(this.camera.getViewRay(this.clickPosWindow.x, this.clickPosWindow.y, this.window.width, this.window.height));
      this.dragPosPlane = this.panPlane.intersectRay(this.camera.getViewRay(this.dragPosWindow.x, this.dragPosWindow.y, this.window.width, this.window.height));
      invViewMatrix = this.camera.getViewMatrix().dup().invert();
      this.clickPosWorld = this.clickPosPlane.dup().transformMat4(invViewMatrix);
      this.dragPosWorld = this.dragPosPlane.dup().transformMat4(invViewMatrix);
      this.diffWorld = this.dragPosWorld.dup().sub(this.clickPosWorld);
      this.camera.setTarget(this.clickTarget.dup().sub(this.diffWorld));
      this.updateCamera();
    } else {
      this.dragPos = this.mouseToSphere(x, y);
      this.rotAxis.asCross(this.clickPos, this.dragPos);
      theta = this.clickPos.dot(this.dragPos);
      this.dragRot.set(this.rotAxis.x, this.rotAxis.y, this.rotAxis.z, theta);
      this.currRot.asMul(this.dragRot, this.clickRot);
    }
    return this.updateCamera();
  };

  Arcball.prototype.updateCamera = function() {
    var eye, offset, q, target, up;
    q = this.currRot.clone();
    q.w *= -1;
    target = this.camera.getTarget();
    offset = Vec3.create(0, 0, this.distance).transformQuat(q);
    eye = Vec3.create().asAdd(target, offset);
    up = Vec3.create(0, 1, 0).transformQuat(q);
    return this.camera.lookAt(target, eye, up);
  };

  Arcball.prototype.disableZoom = function() {
    return this.allowZooming = false;
  };

  Arcball.prototype.setDistance = function(distance) {
    this.distance = distance || 2;
    this.minDistance = distance / 2 || 0.3;
    this.maxDistance = distance * 2 || 5;
    return this.updateCamera();
  };

  return Arcball;

})();

module.exports = Arcball;

},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Buffer.js":[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var Buffer, Color, Context, Edge, Face3, Face4, FacePolygon, Vec2, Vec3, Vec4, hasProperties, _ref;

_ref = require('pex-geom'), Vec2 = _ref.Vec2, Vec3 = _ref.Vec3, Vec4 = _ref.Vec4, Edge = _ref.Edge, Face3 = _ref.Face3, Face4 = _ref.Face4, FacePolygon = _ref.FacePolygon;

Color = require('pex-color').Color;

Context = require('./Context');

hasProperties = function(obj, list) {
  var prop, _i, _len;
  for (_i = 0, _len = list.length; _i < _len; _i++) {
    prop = list[_i];
    if (typeof obj[prop] === 'undefined') {
      return false;
    }
  }
  return true;
};

Buffer = (function() {
  function Buffer(target, type, data, usage) {
    this.gl = Context.currentContext;
    this.target = target;
    this.type = type;
    this.usage = usage || gl.STATIC_DRAW;
    this.dataBuf = null;
    if (data) {
      this.update(data, this.usage);
    }
  }

  Buffer.prototype.dispose = function() {
    this.gl.deleteBuffer(this.handle);
    return this.handle = null;
  };

  Buffer.prototype.update = function(data, usage) {
    var e, face, i, index, numIndices, v, _i, _j, _k, _l, _len, _len1, _len2, _len3, _len4, _len5, _len6, _len7, _m, _n, _o, _p;
    if (!this.handle) {
      this.handle = this.gl.createBuffer();
    }
    this.usage = usage || this.usage;
    if (!data || data.length === 0) {
      return;
    }
    if (!isNaN(data[0])) {
      if (!this.dataBuf || this.dataBuf.length !== data.length) {
        this.dataBuf = new this.type(data.length);
      }
      for (i = _i = 0, _len = data.length; _i < _len; i = ++_i) {
        v = data[i];
        this.dataBuf[i] = v;
        this.elementSize = 1;
      }
    } else if (hasProperties(data[0], ['x', 'y', 'z', 'w'])) {
      if (!this.dataBuf || this.dataBuf.length !== data.length * 4) {
        this.dataBuf = new this.type(data.length * 4);
        this.elementSize = 4;
      }
      for (i = _j = 0, _len1 = data.length; _j < _len1; i = ++_j) {
        v = data[i];
        this.dataBuf[i * 4 + 0] = v.x;
        this.dataBuf[i * 4 + 1] = v.y;
        this.dataBuf[i * 4 + 2] = v.z;
        this.dataBuf[i * 4 + 3] = v.w;
      }
    } else if (hasProperties(data[0], ['x', 'y', 'z'])) {
      if (!this.dataBuf || this.dataBuf.length !== data.length * 3) {
        this.dataBuf = new this.type(data.length * 3);
        this.elementSize = 3;
      }
      for (i = _k = 0, _len2 = data.length; _k < _len2; i = ++_k) {
        v = data[i];
        this.dataBuf[i * 3 + 0] = v.x;
        this.dataBuf[i * 3 + 1] = v.y;
        this.dataBuf[i * 3 + 2] = v.z;
      }
    } else if (hasProperties(data[0], ['x', 'y'])) {
      if (!this.dataBuf || this.dataBuf.length !== data.length * 2) {
        this.dataBuf = new this.type(data.length * 2);
        this.elementSize = 2;
      }
      for (i = _l = 0, _len3 = data.length; _l < _len3; i = ++_l) {
        v = data[i];
        this.dataBuf[i * 2 + 0] = v.x;
        this.dataBuf[i * 2 + 1] = v.y;
      }
    } else if (hasProperties(data[0], ['r', 'g', 'b', 'a'])) {
      if (!this.dataBuf || this.dataBuf.length !== data.length * 4) {
        this.dataBuf = new this.type(data.length * 4);
        this.elementSize = 4;
      }
      for (i = _m = 0, _len4 = data.length; _m < _len4; i = ++_m) {
        v = data[i];
        this.dataBuf[i * 4 + 0] = v.r;
        this.dataBuf[i * 4 + 1] = v.g;
        this.dataBuf[i * 4 + 2] = v.b;
        this.dataBuf[i * 4 + 3] = v.a;
      }
    } else if (data[0].length === 2) {
      if (!this.dataBuf || this.dataBuf.length !== data.length * 2) {
        this.dataBuf = new this.type(data.length * 2);
        this.elementSize = 1;
      }
      for (i = _n = 0, _len5 = data.length; _n < _len5; i = ++_n) {
        e = data[i];
        this.dataBuf[i * 2 + 0] = e[0];
        this.dataBuf[i * 2 + 1] = e[1];
      }
    } else if (data[0].length >= 3) {
      numIndices = 0;
      for (_o = 0, _len6 = data.length; _o < _len6; _o++) {
        face = data[_o];
        if (face.length === 3) {
          numIndices += 3;
        }
        if (face.length === 4) {
          numIndices += 6;
        }
        if (face.length > 4) {
          throw 'FacePolygons ' + face.length + ' + are not supported in RenderableGeometry Buffers';
        }
      }
      if (!this.dataBuf || this.dataBuf.length !== numIndices) {
        this.dataBuf = new this.type(numIndices);
        this.elementSize = 1;
      }
      index = 0;
      for (_p = 0, _len7 = data.length; _p < _len7; _p++) {
        face = data[_p];
        if (face.length === 3) {
          this.dataBuf[index + 0] = face[0];
          this.dataBuf[index + 1] = face[1];
          this.dataBuf[index + 2] = face[2];
          index += 3;
        }
        if (face.length === 4) {
          this.dataBuf[index + 0] = face[0];
          this.dataBuf[index + 1] = face[1];
          this.dataBuf[index + 2] = face[3];
          this.dataBuf[index + 3] = face[3];
          this.dataBuf[index + 4] = face[1];
          this.dataBuf[index + 5] = face[2];
          index += 6;
        }
      }
    } else {
      console.log('Buffer.unknown type', data.name, data[0]);
    }
    this.gl.bindBuffer(this.target, this.handle);
    return this.gl.bufferData(this.target, this.dataBuf, this.usage);
  };

  return Buffer;

})();

module.exports = Buffer;

},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js":[function(require,module,exports){
var sys = require('pex-sys');

var currentGLContext = null;

var Context = {
};

Object.defineProperty(Context, 'currentContext', {
  get: function() { 
    if (currentGLContext) {
      return currentGLContext;
    }
    else if (sys.Window.currentWindow) {
      return sys.Window.currentWindow.gl;
    }
    else {
      return null;
    }
  },
  set: function(gl) {
    currentGLContext = gl;
  },
  enumerable: true,
  configurable: true
});

module.exports = Context;
},{"pex-sys":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Material.js":[function(require,module,exports){
var Context = require('./Context');

function Material(program, uniforms) {
  this.gl = Context.currentContext;
  this.program = program;
  this.uniforms = uniforms || {};
  this.prevUniforms = {};
}

Material.prototype.use = function () {
  this.program.use();
  var numTextures = 0;
  for (var name in this.uniforms) {
    if (this.program.uniforms[name]) {
      if (this.program.uniforms[name].type == this.gl.SAMPLER_2D || this.program.uniforms[name].type == this.gl.SAMPLER_CUBE) {
        this.gl.activeTexture(this.gl.TEXTURE0 + numTextures);
        if (this.uniforms[name].width > 0 && this.uniforms[name].height > 0) {
          this.gl.bindTexture(this.uniforms[name].target, this.uniforms[name].handle);
          this.program.uniforms[name](numTextures);
        }
        numTextures++;
      } else {
        var newValue = this.uniforms[name];
        var oldValue = this.prevUniforms[name];
        var newHash = null;
        if (oldValue !== null) {
          if (newValue.hash) {
            newHash = newValue.hash();
            if (newHash == oldValue) {
              continue;
            }
          } else if (newValue == oldValue) {
            continue;
          }
        }
        this.program.uniforms[name](this.uniforms[name]);
        this.prevUniforms[name] = newHash ? newHash : newValue;
      }
    }
  }
};

module.exports = Material;
},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Mesh.js":[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var BoundingBox, Context, Mat4, Mesh, Quat, RenderableGeometry, Vec3, merge, _ref;

merge = require('merge');

_ref = require('pex-geom'), Vec3 = _ref.Vec3, Quat = _ref.Quat, Mat4 = _ref.Mat4, BoundingBox = _ref.BoundingBox;

Context = require('./Context');

RenderableGeometry = require('./RenderableGeometry');

Mesh = (function() {
  function Mesh(geometry, material, options) {
    this.gl = Context.currentContext;
    this.geometry = merge(geometry, RenderableGeometry);
    this.material = material;
    options = options || {};
    this.primitiveType = options.primitiveType;
    if (this.primitiveType == null) {
      this.primitiveType = this.gl.TRIANGLES;
    }
    if (options.lines) {
      this.primitiveType = this.gl.LINES;
    }
    if (options.triangles) {
      this.primitiveType = this.gl.TRIANGLES;
    }
    if (options.points) {
      this.primitiveType = this.gl.POINTS;
    }
    this.position = Vec3.create(0, 0, 0);
    this.rotation = Quat.create();
    this.scale = Vec3.create(1, 1, 1);
    this.projectionMatrix = Mat4.create();
    this.viewMatrix = Mat4.create();
    this.invViewMatrix = Mat4.create();
    this.modelWorldMatrix = Mat4.create();
    this.modelViewMatrix = Mat4.create();
    this.rotationMatrix = Mat4.create();
    this.normalMatrix = Mat4.create();
  }

  Mesh.prototype.draw = function(camera) {
    var num;
    if (this.geometry.isDirty()) {
      this.geometry.compile();
    }
    if (camera) {
      this.updateMatrices(camera);
      this.updateMatricesUniforms(this.material);
    }
    this.material.use();
    this.bindAttribs();
    if (this.geometry.faces && this.geometry.faces.length > 0 && this.primitiveType !== this.gl.LINES && this.primitiveType !== this.gl.POINTS) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.geometry.faces.buffer.handle);
      this.gl.drawElements(this.primitiveType, this.geometry.faces.buffer.dataBuf.length, this.gl.UNSIGNED_SHORT, 0);
    } else if (this.geometry.edges && this.geometry.edges.length > 0 && this.primitiveType === this.gl.LINES) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.geometry.edges.buffer.handle);
      this.gl.drawElements(this.primitiveType, this.geometry.edges.buffer.dataBuf.length, this.gl.UNSIGNED_SHORT, 0);
    } else if (this.geometry.vertices) {
      num = this.geometry.vertices.length;
      this.gl.drawArrays(this.primitiveType, 0, num);
    }
    return this.unbindAttribs();
  };

  Mesh.prototype.drawInstances = function(camera, instances) {
    var instance, num, _i, _j, _k, _len, _len1, _len2;
    if (this.geometry.isDirty()) {
      this.geometry.compile();
    }
    this.material.use();
    this.bindAttribs();
    if (this.geometry.faces && this.geometry.faces.length > 0 && !this.useEdges) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.geometry.faces.buffer.handle);
      for (_i = 0, _len = instances.length; _i < _len; _i++) {
        instance = instances[_i];
        if (camera) {
          this.updateMatrices(camera, instance);
          this.updateMatricesUniforms(this.material);
          this.updateUniforms(this.material, instance);
          this.material.use();
        }
        this.gl.drawElements(this.primitiveType, this.geometry.faces.buffer.dataBuf.length, this.gl.UNSIGNED_SHORT, 0);
      }
    } else if (this.geometry.edges && this.useEdges) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.geometry.edges.buffer.handle);
      for (_j = 0, _len1 = instances.length; _j < _len1; _j++) {
        instance = instances[_j];
        if (camera) {
          this.updateMatrices(camera, instance);
          this.updateMatricesUniforms(this.material);
          this.updateUniforms(this.material, instance);
          this.material.use();
        }
        this.gl.drawElements(this.primitiveType, this.geometry.edges.buffer.dataBuf.length, this.gl.UNSIGNED_SHORT, 0);
      }
    } else if (this.geometry.vertices) {
      num = this.geometry.vertices.length;
      for (_k = 0, _len2 = instances.length; _k < _len2; _k++) {
        instance = instances[_k];
        if (camera) {
          this.updateMatrices(camera, instance);
          this.updateMatricesUniforms(this.material);
          this.updateUniforms(this.material, instance);
          this.material.use();
        }
        this.gl.drawArrays(this.primitiveType, 0, num);
      }
    }
    return this.unbindAttribs();
  };

  Mesh.prototype.bindAttribs = function() {
    var attrib, name, program, _ref1, _results;
    program = this.material.program;
    _ref1 = this.geometry.attribs;
    _results = [];
    for (name in _ref1) {
      attrib = _ref1[name];
      attrib.location = this.gl.getAttribLocation(program.handle, attrib.name);
      if (attrib.location >= 0) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, attrib.buffer.handle);
        this.gl.vertexAttribPointer(attrib.location, attrib.buffer.elementSize, this.gl.FLOAT, false, 0, 0);
        _results.push(this.gl.enableVertexAttribArray(attrib.location));
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };

  Mesh.prototype.unbindAttribs = function() {
    var attrib, name, _ref1, _results;
    _ref1 = this.geometry.attribs;
    _results = [];
    for (name in _ref1) {
      attrib = _ref1[name];
      if (attrib.location >= 0) {
        _results.push(this.gl.disableVertexAttribArray(attrib.location));
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };

  Mesh.prototype.resetAttribLocations = function() {
    var attrib, name, _results;
    _results = [];
    for (name in this.attributes) {
      attrib = this.attributes[name];
      _results.push(attrib.location = -1);
    }
    return _results;
  };

  Mesh.prototype.updateMatrices = function(camera, instance) {
    var position, rotation, scale;
    position = instance && instance.position ? instance.position : this.position;
    rotation = instance && instance.rotation ? instance.rotation : this.rotation;
    scale = instance && instance.scale ? instance.scale : this.scale;
    rotation.toMat4(this.rotationMatrix);
    this.modelWorldMatrix.identity().translate(position.x, position.y, position.z).mul(this.rotationMatrix).scale(scale.x, scale.y, scale.z);
    if (camera) {
      this.projectionMatrix.copy(camera.getProjectionMatrix());
      this.viewMatrix.copy(camera.getViewMatrix());
      this.invViewMatrix.copy(camera.getViewMatrix().dup().invert());
      this.modelViewMatrix.copy(camera.getViewMatrix()).mul(this.modelWorldMatrix);
      return this.normalMatrix.copy(this.modelViewMatrix).invert().transpose();
    }
  };

  Mesh.prototype.updateUniforms = function(material, instance) {
    var uniformName, uniformValue, _ref1, _results;
    _ref1 = instance.uniforms;
    _results = [];
    for (uniformName in _ref1) {
      uniformValue = _ref1[uniformName];
      _results.push(material.uniforms[uniformName] = uniformValue);
    }
    return _results;
  };

  Mesh.prototype.updateMatricesUniforms = function(material) {
    var materialUniforms, programUniforms;
    programUniforms = this.material.program.uniforms;
    materialUniforms = this.material.uniforms;
    if (programUniforms.projectionMatrix) {
      materialUniforms.projectionMatrix = this.projectionMatrix;
    }
    if (programUniforms.viewMatrix) {
      materialUniforms.viewMatrix = this.viewMatrix;
    }
    if (programUniforms.invViewMatrix) {
      materialUniforms.invViewMatrix = this.invViewMatrix;
    }
    if (programUniforms.modelWorldMatrix) {
      materialUniforms.modelWorldMatrix = this.modelWorldMatrix;
    }
    if (programUniforms.modelViewMatrix) {
      materialUniforms.modelViewMatrix = this.modelViewMatrix;
    }
    if (programUniforms.normalMatrix) {
      return materialUniforms.normalMatrix = this.normalMatrix;
    }
  };

  Mesh.prototype.getMaterial = function() {
    return this.material;
  };

  Mesh.prototype.setMaterial = function(material) {
    this.material = material;
    return this.resetAttribLocations();
  };

  Mesh.prototype.getProgram = function() {
    return this.material.program;
  };

  Mesh.prototype.setProgram = function(program) {
    this.material.program = program;
    return this.resetAttribLocations();
  };

  Mesh.prototype.dispose = function() {
    return this.geometry.dispose();
  };

  Mesh.prototype.getBoundingBox = function() {
    if (!this.boundingBox) {
      this.updateBoundingBox();
    }
    return this.boundingBox;
  };

  Mesh.prototype.updateBoundingBox = function() {
    this.updateMatrices();
    return this.boundingBox = BoundingBox.fromPoints(this.geometry.vertices.map((function(_this) {
      return function(v) {
        return v.dup().transformMat4(_this.modelWorldMatrix);
      };
    })(this)));
  };

  return Mesh;

})();

module.exports = Mesh;

},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","./RenderableGeometry":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/RenderableGeometry.js","merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/node_modules/merge/merge.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/OrthographicCamera.js":[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var Mat4, OrthographicCamera, Ray, Vec2, Vec3, Vec4, _ref;

_ref = require('pex-geom'), Vec2 = _ref.Vec2, Vec3 = _ref.Vec3, Vec4 = _ref.Vec4, Mat4 = _ref.Mat4, Ray = _ref.Ray;

OrthographicCamera = (function() {
  var projected;

  function OrthographicCamera(x, y, width, height, near, far, position, target, up) {
    var b, l, r, t;
    l = x;
    r = x + width;
    t = y;
    b = y + height;
    this.left = l;
    this.right = r;
    this.bottom = b;
    this.top = t;
    this.near = near || 0.1;
    this.far = far || 100;
    this.position = position || Vec3.create(0, 0, 5);
    this.target = target || Vec3.create(0, 0, 0);
    this.up = up || Vec3.create(0, 1, 0);
    this.projectionMatrix = Mat4.create();
    this.viewMatrix = Mat4.create();
    this.updateMatrices();
  }

  OrthographicCamera.prototype.getFov = function() {
    return this.fov;
  };

  OrthographicCamera.prototype.getAspectRatio = function() {
    return this.aspectRatio;
  };

  OrthographicCamera.prototype.getNear = function() {
    return this.near;
  };

  OrthographicCamera.prototype.getFar = function() {
    return this.far;
  };

  OrthographicCamera.prototype.getPosition = function() {
    return this.position;
  };

  OrthographicCamera.prototype.getTarget = function() {
    return this.target;
  };

  OrthographicCamera.prototype.getUp = function() {
    return this.up;
  };

  OrthographicCamera.prototype.getViewMatrix = function() {
    return this.viewMatrix;
  };

  OrthographicCamera.prototype.getProjectionMatrix = function() {
    return this.projectionMatrix;
  };

  OrthographicCamera.prototype.setFov = function(fov) {
    this.fov = fov;
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.setAspectRatio = function(ratio) {
    this.aspectRatio = ratio;
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.setFar = function(far) {
    this.far = far;
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.setNear = function(near) {
    this.near = near;
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.setPosition = function(position) {
    this.position = position;
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.setTarget = function(target) {
    this.target = target;
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.setUp = function(up) {
    this.up = up;
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.lookAt = function(target, eyePosition, up) {
    if (target) {
      this.target = target;
    }
    if (eyePosition) {
      this.position = eyePosition;
    }
    if (up) {
      this.up = up;
    }
    return this.updateMatrices();
  };

  OrthographicCamera.prototype.updateMatrices = function() {
    this.projectionMatrix.identity().ortho(this.left, this.right, this.bottom, this.top, this.near, this.far);
    return this.viewMatrix.identity().lookAt(this.position, this.target, this.up);
  };

  projected = Vec4.create();

  OrthographicCamera.prototype.getScreenPos = function(point, windowWidth, windowHeight) {
    var out;
    projected.set(point.x, point.y, point.z, 1.0);
    projected.transformMat4(this.viewMatrix);
    projected.transformMat4(this.projectionMatrix);
    out = Vec2.create().set(projected.x, projected.y);
    out.x /= projected.w;
    out.y /= projected.w;
    out.x = out.x * 0.5 + 0.5;
    out.y = out.y * 0.5 + 0.5;
    out.x *= windowWidth;
    out.y *= windowHeight;
    return out;
  };

  OrthographicCamera.prototype.getWorldRay = function(x, y, windowWidth, windowHeight) {
    var hNear, invViewMatrix, vOrigin, vTarget, wDirection, wNear, wOrigin, wTarget;
    x = (x - windowWidth / 2) / (windowWidth / 2);
    y = -(y - windowHeight / 2) / (windowHeight / 2);
    hNear = 2 * Math.tan(this.getFov() / 180 * Math.PI / 2) * this.getNear();
    wNear = hNear * this.getAspectRatio();
    x *= wNear / 2;
    y *= hNear / 2;
    vOrigin = new Vec3(0, 0, 0);
    vTarget = new Vec3(x, y, -this.getNear());
    invViewMatrix = this.getViewMatrix().dup().invert();
    wOrigin = vOrigin.dup().transformMat4(invViewMatrix);
    wTarget = vTarget.dup().transformMat4(invViewMatrix);
    wDirection = wTarget.dup().sub(wOrigin);
    return new Ray(wOrigin, wDirection);
  };

  return OrthographicCamera;

})();

module.exports = OrthographicCamera;

},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/PerspectiveCamera.js":[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var Mat4, PerspectiveCamera, Ray, Vec2, Vec3, Vec4, _ref;

_ref = require('pex-geom'), Vec2 = _ref.Vec2, Vec3 = _ref.Vec3, Vec4 = _ref.Vec4, Mat4 = _ref.Mat4, Ray = _ref.Ray;

PerspectiveCamera = (function() {
  var projected;

  function PerspectiveCamera(fov, aspectRatio, near, far, position, target, up) {
    this.fov = fov || 60;
    this.aspectRatio = aspectRatio || 4 / 3;
    this.near = near || 0.1;
    this.far = far || 100;
    this.position = position || Vec3.create(0, 0, 5);
    this.target = target || Vec3.create(0, 0, 0);
    this.up = up || Vec3.create(0, 1, 0);
    this.projectionMatrix = Mat4.create();
    this.viewMatrix = Mat4.create();
    this.updateMatrices();
  }

  PerspectiveCamera.prototype.getFov = function() {
    return this.fov;
  };

  PerspectiveCamera.prototype.getAspectRatio = function() {
    return this.aspectRatio;
  };

  PerspectiveCamera.prototype.getNear = function() {
    return this.near;
  };

  PerspectiveCamera.prototype.getFar = function() {
    return this.far;
  };

  PerspectiveCamera.prototype.getPosition = function() {
    return this.position;
  };

  PerspectiveCamera.prototype.getTarget = function() {
    return this.target;
  };

  PerspectiveCamera.prototype.getUp = function() {
    return this.up;
  };

  PerspectiveCamera.prototype.getViewMatrix = function() {
    return this.viewMatrix;
  };

  PerspectiveCamera.prototype.getProjectionMatrix = function() {
    return this.projectionMatrix;
  };

  PerspectiveCamera.prototype.setFov = function(fov) {
    this.fov = fov;
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.setAspectRatio = function(ratio) {
    this.aspectRatio = ratio;
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.setFar = function(far) {
    this.far = far;
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.setNear = function(near) {
    this.near = near;
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.setPosition = function(position) {
    this.position = position;
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.setTarget = function(target) {
    this.target = target;
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.setUp = function(up) {
    this.up = up;
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.lookAt = function(target, eyePosition, up) {
    if (target) {
      this.target = target;
    }
    if (eyePosition) {
      this.position = eyePosition;
    }
    if (up) {
      this.up = up;
    }
    return this.updateMatrices();
  };

  PerspectiveCamera.prototype.updateMatrices = function() {
    this.projectionMatrix.identity().perspective(this.fov, this.aspectRatio, this.near, this.far);
    return this.viewMatrix.identity().lookAt(this.position, this.target, this.up);
  };

  projected = Vec4.create();

  PerspectiveCamera.prototype.getScreenPos = function(point, windowWidth, windowHeight) {
    var out;
    projected.set(point.x, point.y, point.z, 1.0);
    projected.transformMat4(this.viewMatrix);
    projected.transformMat4(this.projectionMatrix);
    out = Vec2.create().set(projected.x, projected.y);
    out.x /= projected.w;
    out.y /= projected.w;
    out.x = out.x * 0.5 + 0.5;
    out.y = out.y * 0.5 + 0.5;
    out.x *= windowWidth;
    out.y *= windowHeight;
    return out;
  };

  PerspectiveCamera.prototype.getViewRay = function(x, y, windowWidth, windowHeight) {
    var hNear, px, py, vDirection, vOrigin, vTarget, wNear;
    px = (x - windowWidth / 2) / (windowWidth / 2);
    py = -(y - windowHeight / 2) / (windowHeight / 2);
    hNear = 2 * Math.tan(this.getFov() / 180 * Math.PI / 2) * this.getNear();
    wNear = hNear * this.getAspectRatio();
    px *= wNear / 2;
    py *= hNear / 2;
    vOrigin = new Vec3(0, 0, 0);
    vTarget = new Vec3(px, py, -this.getNear());
    vDirection = vTarget.dup().sub(vOrigin).normalize();
    return new Ray(vOrigin, vDirection);
  };

  PerspectiveCamera.prototype.getWorldRay = function(x, y, windowWidth, windowHeight) {
    var hNear, invViewMatrix, vOrigin, vTarget, wDirection, wNear, wOrigin, wTarget;
    x = (x - windowWidth / 2) / (windowWidth / 2);
    y = -(y - windowHeight / 2) / (windowHeight / 2);
    hNear = 2 * Math.tan(this.getFov() / 180 * Math.PI / 2) * this.getNear();
    wNear = hNear * this.getAspectRatio();
    x *= wNear / 2;
    y *= hNear / 2;
    vOrigin = new Vec3(0, 0, 0);
    vTarget = new Vec3(x, y, -this.getNear());
    invViewMatrix = this.getViewMatrix().dup().invert();
    wOrigin = vOrigin.dup().transformMat4(invViewMatrix);
    wTarget = vTarget.dup().transformMat4(invViewMatrix);
    wDirection = wTarget.dup().sub(wOrigin);
    return new Ray(wOrigin, wDirection);
  };

  return PerspectiveCamera;

})();

module.exports = PerspectiveCamera;

},{"pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Program.js":[function(require,module,exports){
var Context = require('./Context');
var sys = require('pex-sys');
var IO = sys.IO;

var kVertexShaderPrefix = '' +
  '#ifdef GL_ES\n' +
  'precision highp float;\n' +
  '#endif\n' +
  '#define VERT\n';

var kFragmentShaderPrefix = '' +
  '#ifdef GL_ES\n' +
  '#ifdef GL_FRAGMENT_PRECISION_HIGH\n' +
  '  precision highp float;\n' +
  '#else\n' +
  '  precision mediump float;\n' +
  '#endif\n' +
  '#endif\n' +
  '#define FRAG\n';

function Program(vertSrc, fragSrc) {
  this.gl = Context.currentContext;
  this.handle = this.gl.createProgram();
  this.uniforms = {};
  this.attributes = {};
  this.addSources(vertSrc, fragSrc);
  this.ready = false;
  if (this.vertShader && this.fragShader) {
    this.link();
  }
}

Program.prototype.addSources = function(vertSrc, fragSrc) {
  if (fragSrc == null) {
    fragSrc = vertSrc;
  }
  if (vertSrc) {
    this.addVertexSource(vertSrc);
  }
  if (fragSrc) {
    return this.addFragmentSource(fragSrc);
  }
};

Program.prototype.addVertexSource = function(vertSrc) {
  this.vertShader = this.gl.createShader(this.gl.VERTEX_SHADER);
  this.gl.shaderSource(this.vertShader, kVertexShaderPrefix + vertSrc + '\n');
  this.gl.compileShader(this.vertShader);
  if (!this.gl.getShaderParameter(this.vertShader, this.gl.COMPILE_STATUS)) {
    throw this.gl.getShaderInfoLog(this.vertShader);
  }
};

Program.prototype.addFragmentSource = function(fragSrc) {
  this.fragShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
  this.gl.shaderSource(this.fragShader, kFragmentShaderPrefix + fragSrc + '\n');
  this.gl.compileShader(this.fragShader);
  if (!this.gl.getShaderParameter(this.fragShader, this.gl.COMPILE_STATUS)) {
    throw this.gl.getShaderInfoLog(this.fragShader);
  }
};

Program.prototype.link = function() {
  this.gl.attachShader(this.handle, this.vertShader);
  this.gl.attachShader(this.handle, this.fragShader);
  this.gl.linkProgram(this.handle);

  if (!this.gl.getProgramParameter(this.handle, this.gl.LINK_STATUS)) {
    throw this.gl.getProgramInfoLog(this.handle);
  }

  var numUniforms = this.gl.getProgramParameter(this.handle, this.gl.ACTIVE_UNIFORMS);

  for (var i=0; i<numUniforms; i++) {
    var info = this.gl.getActiveUniform(this.handle, i);
    if (info.size > 1) {
      for (var j=0; j<info.size; j++) {
        var arrayElementName = info.name.replace(/\[\d+\]/, '[' + j + ']');
        var location = this.gl.getUniformLocation(this.handle, arrayElementName);
        this.uniforms[arrayElementName] = Program.makeUniformSetter(this.gl, info.type, location);
      }
    } else {
      var location = this.gl.getUniformLocation(this.handle, info.name);
      this.uniforms[info.name] = Program.makeUniformSetter(this.gl, info.type, location);
    }
  }

  var numAttributes = this.gl.getProgramParameter(this.handle, this.gl.ACTIVE_ATTRIBUTES);
  for (var i=0; i<numAttributes; i++) {
    info = this.gl.getActiveAttrib(this.handle, i);
    var location = this.gl.getAttribLocation(this.handle, info.name);
    this.attributes[info.name] = location;
  }
  this.ready = true;
  return this;
};

Program.prototype.use = function() {
  if (Program.currentProgram !== this.handle) {
    Program.currentProgram = this.handle;
    return this.gl.useProgram(this.handle);
  }
};

Program.prototype.dispose = function() {
  this.gl.deleteShader(this.vertShader);
  this.gl.deleteShader(this.fragShader);
  return this.gl.deleteProgram(this.handle);
};

Program.load = function(url, callback, options) {
  var program;
  program = new Program();
  IO.loadTextFile(url, function(source) {
    console.log("Program.Compiling " + url);
    program.addSources(source);
    program.link();
    if (callback) {
      callback();
    }
    if (options && options.autoreload) {
      return IO.watchTextFile(url, function(source) {
        var e;
        try {
          program.gl.detachShader(program.handle, program.vertShader);
          program.gl.detachShader(program.handle, program.fragShader);
          program.addSources(source);
          return program.link();
        } catch (_error) {
          e = _error;
          console.log("Program.load : failed to reload " + url);
          return console.log(e);
        }
      });
    }
  });
  return program;
};

Program.makeUniformSetter = function(gl, type, location) {
  var setterFun = null;
  switch (type) {
    case gl.BOOL:
    case gl.INT:
      setterFun = function(value) {
        return gl.uniform1i(location, value);
      };
      break;
    case gl.SAMPLER_2D:
    case gl.SAMPLER_CUBE:
      setterFun = function(value) {
        return gl.uniform1i(location, value);
      };
      break;
    case gl.FLOAT:
      setterFun = function(value) {
        return gl.uniform1f(location, value);
      };
      break;
    case gl.FLOAT_VEC2:
      setterFun = function(v) {
        return gl.uniform2f(location, v.x, v.y);
      };
      break;
    case gl.FLOAT_VEC3:
      setterFun = function(v) {
        return gl.uniform3f(location, v.x, v.y, v.z);
      };
      break;
    case gl.FLOAT_VEC4:
      setterFun = function(v) {
        if (v.r != null) {
          gl.uniform4f(location, v.r, v.g, v.b, v.a);
        }
        if (v.x != null) {
          return gl.uniform4f(location, v.x, v.y, v.z, v.w);
        }
      };
      break;
    case gl.FLOAT_MAT4:
      var mv = new Float32Array(16);
      setterFun = function(m) {
        mv[0] = m.a11;
        mv[1] = m.a21;
        mv[2] = m.a31;
        mv[3] = m.a41;
        mv[4] = m.a12;
        mv[5] = m.a22;
        mv[6] = m.a32;
        mv[7] = m.a42;
        mv[8] = m.a13;
        mv[9] = m.a23;
        mv[10] = m.a33;
        mv[11] = m.a43;
        mv[12] = m.a14;
        mv[13] = m.a24;
        mv[14] = m.a34;
        mv[15] = m.a44;
        return gl.uniformMatrix4fv(location, false, mv);
      };
  }
  if (setterFun) {
    setterFun.type = type;
    return setterFun;
  } else {
    return function() {
      throw "Unknown uniform type: " + type;
    };
  }
};

module.exports = Program;
},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","pex-sys":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/RenderTarget.js":[function(require,module,exports){
var Context = require('./Context');
var Texture2D = require('./Texture2D');

function RenderTarget(width, height, options) {
  var gl = this.gl = Context.currentContext;
  this.width = width;
  this.height = height;
  this.oldBinding = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  this.handle = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.handle);
  this.colorAttachements = [];
  if (options && options.depth) {
    var oldRenderBufferBinding = gl.getParameter(gl.RENDERBUFFER_BINDING);
    var depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.getError();
    //reset error
    if (gl.DEPTH_COMPONENT24) {
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
    }
    if (gl.getError() || !gl.DEPTH_COMPONENT24) {
      //24 bit depth buffer might be not available, trying with 16
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.width, this.height);
    }
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    this.depthBuffer = depthBuffer;
    gl.bindRenderbuffer(gl.RENDERBUFFER, oldRenderBufferBinding);
  }
  var texture = Texture2D.create(width, height, options);
  texture.bind();
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + this.colorAttachements.length, texture.target, texture.handle, 0);
  this.colorAttachements.push(texture);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.oldBinding);
  this.oldBinding = null;
}

RenderTarget.prototype.bind = function () {
  var gl = this.gl;
  this.oldBinding = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.handle);
};

RenderTarget.prototype.bindAndClear = function () {
  var gl = this.gl;
  this.bind();
  gl.clearColor(0, 0, 0, 1);
  if (this.depthBuffer)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  else
    gl.clear(gl.COLOR_BUFFER_BIT);
};

RenderTarget.prototype.unbind = function () {
  var gl = this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.oldBinding);
  this.oldBinding = null;
};

RenderTarget.prototype.getColorAttachement = function (index) {
  index = index || 0;
  return this.colorAttachements[index];
};

 module.exports = RenderTarget;
},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","./Texture2D":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Texture2D.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/RenderableGeometry.js":[function(require,module,exports){
// Generated by CoffeeScript 1.7.1
var Buffer, Context, Geometry, RenderableGeometry, indexTypes;

Geometry = require('pex-geom').Geometry;

Context = require('./Context');

Buffer = require('./Buffer');

indexTypes = ['faces', 'edges', 'indices'];

RenderableGeometry = {
  compile: function() {
    var attrib, attribName, indexName, usage, _i, _len, _ref, _results;
    if (this.gl == null) {
      this.gl = Context.currentContext;
    }
    _ref = this.attribs;
    for (attribName in _ref) {
      attrib = _ref[attribName];
      if (!attrib.buffer) {
        usage = attrib.dynamic ? this.gl.DYNAMIC_DRAW : this.gl.STATIC_DRAW;
        attrib.buffer = new Buffer(this.gl.ARRAY_BUFFER, Float32Array, null, usage);
        attrib.dirty = true;
      }
      if (attrib.dirty) {
        attrib.buffer.update(attrib);
        attrib.dirty = false;
      }
    }
    _results = [];
    for (_i = 0, _len = indexTypes.length; _i < _len; _i++) {
      indexName = indexTypes[_i];
      if (this[indexName]) {
        if (!this[indexName].buffer) {
          usage = this[indexName].dynamic ? this.gl.DYNAMIC_DRAW : this.gl.STATIC_DRAW;
          this[indexName].buffer = new Buffer(this.gl.ELEMENT_ARRAY_BUFFER, Uint16Array, null, usage);
          this[indexName].dirty = true;
        }
        if (this[indexName].dirty) {
          this[indexName].buffer.update(this[indexName]);
          _results.push(this[indexName].dirty = false);
        } else {
          _results.push(void 0);
        }
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  },
  dispose: function() {
    var attrib, attribName, indexName, _i, _len, _ref, _results;
    _ref = this.attribs;
    for (attribName in _ref) {
      attrib = _ref[attribName];
      if (attrib && attrib.buffer) {
        attrib.buffer.dispose();
      }
    }
    _results = [];
    for (_i = 0, _len = indexTypes.length; _i < _len; _i++) {
      indexName = indexTypes[_i];
      if (this[indexName] && this[indexName].buffer) {
        _results.push(this[indexName].buffer.dispose());
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  }
};

module.exports = RenderableGeometry;

},{"./Buffer":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Buffer.js","./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/ScreenImage.js":[function(require,module,exports){
(function (__dirname){
var geom = require('pex-geom');
var Vec2 = geom.Vec2;
var Geometry = geom.Geometry;
var Program = require('./Program');
var Material = require('./Material');
var Mesh = require('./Mesh');


var ScreenImageGLSL = "#ifdef VERT\n\nattribute vec2 position;\nattribute vec2 texCoord;\nuniform vec2 screenSize;\nuniform vec2 pixelPosition;\nuniform vec2 pixelSize;\nvarying vec2 vTexCoord;\n\nvoid main() {\n  float tx = position.x * 0.5 + 0.5; //-1 -> 0, 1 -> 1\n  float ty = -position.y * 0.5 + 0.5; //-1 -> 1, 1 -> 0\n  //(x + 0)/sw * 2 - 1, (x + w)/sw * 2 - 1\n  float x = (pixelPosition.x + pixelSize.x * tx)/screenSize.x * 2.0 - 1.0;  //0 -> -1, 1 -> 1\n  //1.0 - (y + h)/sh * 2, 1.0 - (y + h)/sh * 2\n  float y = 1.0 - (pixelPosition.y + pixelSize.y * ty)/screenSize.y * 2.0;  //0 -> 1, 1 -> -1\n  gl_Position = vec4(x, y, 0.0, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec2 vTexCoord;\nuniform sampler2D image;\nuniform float alpha;\n\nvoid main() {\n  gl_FragColor = texture2D(image, vTexCoord);\n  gl_FragColor.a *= alpha;\n}\n\n#endif";

function ScreenImage(image, x, y, w, h, screenWidth, screenHeight) {
  x = x !== undefined ? x : 0;
  y = y !== undefined ? y : 0;
  w = w !== undefined ? w : 1;
  h = h !== undefined ? h : 1;
  screenWidth = screenWidth !== undefined ? screenWidth : 1;
  screenHeight = screenHeight !== undefined ? screenHeight : 1;
  this.image = image;
  var program = new Program(ScreenImageGLSL);
  var uniforms = {
    screenSize: Vec2.create(screenWidth, screenHeight),
    pixelPosition: Vec2.create(x, y),
    pixelSize: Vec2.create(w, h),
    alpha: 1
  };
  if (image) {
    uniforms.image = image;
  }
  var material = new Material(program, uniforms);
  var vertices = [
    new Vec2(-1, 1),
    new Vec2(-1, -1),
    new Vec2(1, -1),
    new Vec2(1, 1)
  ];
  var texCoords = [
    new Vec2(0, 1),
    new Vec2(0, 0),
    new Vec2(1, 0),
    new Vec2(1, 1)
  ];
  var geometry = new Geometry({
    vertices: vertices,
    texCoords: texCoords,
    faces: true
  });
  // 0----3  0,1   1,1
  // | \  |      u
  // |  \ |      v
  // 1----2  0,0   0,1
  geometry.faces.push([0, 1, 2]);
  geometry.faces.push([0, 2, 3]);
  this.mesh = new Mesh(geometry, material);
}

ScreenImage.prototype.setAlpha = function (alpha) {
  this.mesh.material.uniforms.alpha = alpha;
};

ScreenImage.prototype.setPosition = function (position) {
  this.mesh.material.uniforms.pixelPosition = position;
};

ScreenImage.prototype.setSize = function (size) {
  this.mesh.material.uniforms.pixelSize = size;
};

ScreenImage.prototype.setWindowSize = function (size) {
  this.mesh.material.uniforms.windowSize = size;
};

ScreenImage.prototype.setBounds = function (bounds) {
  this.mesh.material.uniforms.pixelPosition.x = bounds.x;
  this.mesh.material.uniforms.pixelPosition.y = bounds.y;
  this.mesh.material.uniforms.pixelSize.x = bounds.width;
  this.mesh.material.uniforms.pixelSize.y = bounds.height;
};

ScreenImage.prototype.setImage = function (image) {
  this.image = image;
  this.mesh.material.uniforms.image = image;
};

ScreenImage.prototype.draw = function (image, program) {
  var oldImage = null;
  if (image) {
    oldImage = this.mesh.material.uniforms.image;
    this.mesh.material.uniforms.image = image;
  }
  var oldProgram = null;
  if (program) {
    oldProgram = this.mesh.getProgram();
    this.mesh.setProgram(program);
  }
  this.mesh.draw();
  if (oldProgram) {
    this.mesh.setProgram(oldProgram);
  }
  if (oldImage) {
    this.mesh.material.uniforms.image = oldImage;
  }
};

module.exports = ScreenImage;
}).call(this,"/node_modules/pex-glu/lib")
},{"./Material":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Material.js","./Mesh":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Mesh.js","./Program":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Program.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Texture.js":[function(require,module,exports){
var Context = require('./Context');

function Texture(target) {
  if (target) {
    this.init(target);
  }
}

Texture.RGBA32F = 34836;

Texture.prototype.init = function(target) {
  this.gl = Context.currentContext;
  this.target = target;
  this.handle = this.gl.createTexture();
};

//### bind ( unit )
//Binds the texture to the current GL context.
//`unit` - texture unit in which to place the texture *{ Number/Int }* = 0

Texture.prototype.bind = function(unit) {
  unit = unit ? unit : 0;
  this.gl.activeTexture(this.gl.TEXTURE0 + unit);
  this.gl.bindTexture(this.target, this.handle);
};

module.exports = Texture;
},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Texture2D.js":[function(require,module,exports){
var sys = require('pex-sys');
var merge = require('merge');
var IO = sys.IO;
var Context = require('./Context');
var Texture = require('./Texture');

function Texture2D() {
  this.gl = Context.currentContext;
  Texture.call(this, this.gl.TEXTURE_2D);
}

Texture2D.prototype = Object.create(Texture.prototype);

Texture2D.create = function(w, h, options) {
  var defaultOptions = {
    repeat: false,
    mipmap: false,
    nearest: false
  };
  options = merge(defaultOptions, options);

  var texture = new Texture2D();
  texture.bind();
  var gl = texture.gl;
  var isWebGL = gl.getExtension ? true : false;
  var internalFloatFormat = isWebGL ? gl.RGBA : 34836;
  if (options.bpp == 32) {
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFloatFormat, w, h, 0, gl.RGBA, gl.FLOAT, null);
  }
  else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  var wrapS = options.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  var wrapT = options.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  var magFilter = gl.LINEAR;
  var minFilter = gl.LINEAR;

  if (options.nearest) {
    magFilter = gl.NEAREST;
    minFilter = gl.NEAREST;
  }

  if (options.mipmap) {
    minFilter = gl.LINEAR_MIPMAP_LINEAR;
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
  gl.bindTexture(gl.TEXTURE_2D, null);

  texture.width = w;
  texture.height = h;
  texture.target = gl.TEXTURE_2D;
  return texture;
};

Texture2D.prototype.bind = function(unit) {
  unit = unit ? unit : 0;
  this.gl.activeTexture(this.gl.TEXTURE0 + unit);
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.handle);
};

Texture2D.genNoise = function(w, h) {
  w = w || 256;
  h = h || 256;
  var gl = Context.currentContext;
  var texture = new Texture2D();
  texture.bind();
  //TODO: should check unpack alignment as explained here https://groups.google.com/forum/#!topic/webgl-dev-list/wuUZP7iTr9Q
  var b = new ArrayBuffer(w * h * 2);
  var pixels = new Uint8Array(b);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      pixels[y * w + x] = Math.floor(Math.random() * 255);
    }
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  texture.width = w;
  texture.height = h;
  return texture;
};

Texture2D.genNoiseRGBA = function(w, h) {
  w = w || 256;
  h = h || 256;
  var gl = Context.currentContext;
  var handle = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, handle);
  var b = new ArrayBuffer(w * h * 4);
  var pixels = new Uint8Array(b);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      pixels[(y * w + x) * 4 + 0] = y;
      pixels[(y * w + x) * 4 + 1] = Math.floor(255 * Math.random());
      pixels[(y * w + x) * 4 + 2] = Math.floor(255 * Math.random());
      pixels[(y * w + x) * 4 + 3] = Math.floor(255 * Math.random());
    }
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  var texture = new Texture2D();
  texture.handle = handle;
  texture.width = w;
  texture.height = h;
  texture.target = gl.TEXTURE_2D;
  texture.gl = gl;
  return texture;
};

Texture2D.load = function(src, options, callback) {
  if (!callback && typeof(options) == 'function') {
    callback = options;
    optiosn = null;
  }
  var defaultOptions = {
    repeat: false,
    mipmap: false,
    nearest: false
  };
  options = merge(defaultOptions, options);

  var gl = Context.currentContext;
  var texture = Texture2D.create(0, 0, options);
  texture.ready = false;
  IO.loadImageData(gl, texture.handle, texture.target, texture.target, src, { flip: true, crossOrigin: options.crossOrigin }, function(image) {
    if (!image) {
      texture.dispose();
      var noise = Texture2D.getNoise();
      texture.handle = noise.handle;
      texture.width = noise.width;
      texture.height = noise.height;
    }
    if (options.mipmap) {
      texture.generateMipmap();
    }
    gl.bindTexture(texture.target, null);
    texture.width = image.width;
    texture.height = image.height;
    texture.ready = true;
    if (callback) {
      callback(texture);
    }
  });
  return texture;
};

Texture2D.prototype.dispose = function() {
  if (this.handle) {
    this.gl.deleteTexture(this.handle);
    this.handle = null;
  }
};

Texture2D.prototype.generateMipmap = function() {
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.handle);
  this.gl.generateMipmap(this.gl.TEXTURE_2D);
}

module.exports = Texture2D;
},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","./Texture":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Texture.js","merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/node_modules/merge/merge.js","pex-sys":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/TextureCube.js":[function(require,module,exports){
var sys = require('pex-sys');
var IO = sys.IO;
var Platform = sys.Platform;
var Context = require('./Context');
var Texture = require('./Texture');
var merge = require('merge');

//### TextureCube ( )
//Does nothing, use *load()* method instead.
function TextureCube() {
  this.gl = Context.currentContext;
  Texture.call(this, this.gl.TEXTURE_CUBE_MAP);
}

TextureCube.prototype = Object.create(Texture.prototype);

//### load ( src )
//Load texture from file (in Plask) or url (in the web browser).
//
//`src` - path to file or url (e.g. *path/file_####.jpg*) *{ String }*
//
//Returns the loaded texture *{ Texture2D }*
//
//*Note* the path or url must contain #### that will be replaced by
//id (e.g. *posx*) of the cube side*
//
//*Note: In Plask the texture is ready immediately, in the web browser it's
//first black until the file is loaded and texture can be populated with the image data.*
TextureCube.load = function (files, options, callback) {
  var defaultOptions = {
    mipmap: false,
    nearest: false
  };
  options = merge(defaultOptions, options);

  var gl = Context.currentContext;
  var texture = new TextureCube();
  var cubeMapTargets = [
    gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
    gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
    gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
  ];

  var minFilter = gl.LINEAR;
  var magFilter = gl.LINEAR;

  if (options.nearest) {
    magFilter = gl.NEAREST;
    minFilter = gl.NEAREST;
  }

  if (options.mipmap || files.length > 6) {
    minFilter = gl.LINEAR_MIPMAP_LINEAR;
  }

  gl.bindTexture(texture.target, texture.handle);
  gl.texParameteri(texture.target, gl.TEXTURE_MAG_FILTER, magFilter);
  gl.texParameteri(texture.target, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(texture.target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(texture.target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  texture.ready = false;
  var loadedImages = 0;
  for (var i = 0; i < files.length; i++) {
    IO.loadImageData(gl, texture.handle, texture.target, cubeMapTargets[i%6], files[i], { flip: false, lod: Math.floor(i/6) }, function (image) {
      texture.width = image.width;
      texture.height = image.height;
      if (++loadedImages == files.length) {
        if (options.mipmap) {
          gl.bindTexture(texture.target, texture.handle);
          gl.generateMipmap(texture.target);
        }
        texture.ready = true;
        if (callback) callback(texture);
      }
    });
  }
  return texture;
};

//### dispose ( )
//Frees the texture data.
TextureCube.prototype.dispose = function () {
  if (this.handle) {
    this.gl.deleteTexture(this.handle);
    this.handle = null;
  }
};

module.exports = TextureCube;

},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js","./Texture":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Texture.js","merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/node_modules/merge/merge.js","pex-sys":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Utils.js":[function(require,module,exports){
var Context = require('./Context');

module.exports.getCurrentContext = function() {
  return Context.currentContext;
}

module.exports.clearColor = function(color) {
  var gl = Context.currentContext;
  if (color)
    gl.clearColor(color.r, color.g, color.b, color.a);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return this;
};

module.exports.clearDepth = function() {
  var gl = Context.currentContext;
  gl.clear(gl.DEPTH_BUFFER_BIT);
  return this;
};

module.exports.clearColorAndDepth = function(color) {
  var gl = Context.currentContext;
  color = color || { r: 0, g:0, b:0, a: 1};
  gl.clearColor(color.r, color.g, color.b, color.a);
  gl.depthMask(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  return this;
};

module.exports.enableDepthReadAndWrite = function(depthRead, depthWrite) {
  if (arguments.length == 2) {
    //do nothing, just use the values
  }
  else if (arguments.length == 1) {
    //use the same value for both read and write
    depthWrite = depthRead;
  }
  else {
    //defaults
    depthRead = true;
    depthWrite = true;
  }

  var gl = Context.currentContext;

  if (depthWrite) gl.depthMask(1);
  else gl.depthMask(0);

  if (depthRead) gl.enable(gl.DEPTH_TEST);
  else gl.disable(gl.DEPTH_TEST);

  return this;
};

module.exports.enableAdditiveBlending = function() {
  return this.enableBlending("ONE", "ONE");
};

module.exports.enableAlphaBlending = function(src, dst) {
  return this.enableBlending("SRC_ALPHA", "ONE_MINUS_SRC_ALPHA");
};

module.exports.enableBlending = function(src, dst) {
  var gl = Context.currentContext;
  if (src === false) {
    gl.disable(gl.BLEND);
    return this;
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl[src], gl[dst]);
  return this;
};

//OpenGL viewport 0,0 is in bottom left corner
//
//  0,h-----w,h
//   |       |
//   |       |
//  0,0-----w,0
//
module.exports.viewport = function(x, y, w, h) {
  var gl = Context.currentContext;
  gl.viewport(x, y, w, h);
  return this;
};

module.exports.scissor = function(x, y, w, h) {
  var gl = Context.currentContext;
  if (x === false) {
    gl.disable(gl.SCISSOR_TEST);
  }
  else if (x.width != null) {
    var rect = x;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect.x, rect.y, rect.width, rect.height);
  }
  else {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, w, h);
  }
  return this;
};

module.exports.cullFace = function(enabled) {
  enabled = (enabled !== undefined) ? enabled : true
  var gl = Context.currentContext;
  if (enabled)
    gl.enable(gl.CULL_FACE);
  else
    gl.disable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  return this;
};

module.exports.lineWidth = function(width) {
  var gl = Context.currentContext;
  gl.lineWidth(width);
  return this;
}
},{"./Context":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/lib/Context.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/node_modules/merge/merge.js":[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.1.3
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	function merge() {

		var items = Array.prototype.slice.call(arguments),
			result = items.shift(),
			deep = (result === true),
			size = items.length,
			item, index, key;

		if (deep || typeOf(result) !== 'object')

			result = {};

		for (index=0;index<size;++index)

			if (typeOf(item = items[index]) === 'object')

				for (key in item)

					result[key] = deep ? clone(item[key]) : item[key];

		return result;

	}

	function clone(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = clone(input[index]);

		}

		return output;

	}

	function typeOf(input) {

		return ({}).toString.call(input).match(/\s([\w]+)/)[1].toLowerCase();

	}

	if (isNode) {

		module.exports = merge;

	} else {

		window.merge = merge;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/index.js":[function(require,module,exports){
module.exports.GUI = require('./lib/GUI');
},{"./lib/GUI":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/GUI.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/GUI.js":[function(require,module,exports){
var glu = require('pex-glu');
var geom = require('pex-geom');
var sys = require('pex-sys');
var color = require('pex-color');
var Platform = sys.Platform;
var GUIControl = require('./GUIControl');
var SkiaRenderer = require('./SkiaRenderer');
var HTMLCanvasRenderer = require('./HTMLCanvasRenderer');
var Context = glu.Context;
var ScreenImage = glu.ScreenImage;
var Vec2 = geom.Vec2;
var Vec3 = geom.Vec3;
var Rect = geom.Rect;
var Spline1D = geom.Spline1D;
var Spline2D = geom.Spline2D;
var IO = sys.IO;
var Color = color.Color;

//`window` - parent window
//`x` - gui x position
//`y` - gui y position
//`scale` - slider scale, usefull for touch
//do not mistake that for highdpi as his is handled automatically based on window.settings.highdpi
function GUI(window, x, y, scale) {
  this.gl = Context.currentContext;
  this.window = window;
  this.x = x === undefined ? 0 : x;
  this.y = y === undefined ? 0 : y;
  this.mousePos = Vec2.create();
  this.scale = scale || 1;
  this.highdpi = window.settings.highdpi || 1;
  if (Platform.isPlask) {
    this.renderer = new SkiaRenderer(window.width, window.height, this.highdpi);
  }
  else if (Platform.isBrowser) {
    this.renderer = new HTMLCanvasRenderer(window.width, window.height, this.highdpi);
  }
  this.screenBounds = new Rect(this.x, this.y, window.width, window.height);
  this.screenImage = new ScreenImage(this.renderer.getTexture(), this.x, this.y, window.width, window.height, window.width, window.height);
  this.items = [];
  this.bindEventListeners(window);
}

GUI.prototype.bindEventListeners = function (window) {
  var self = this;
  window.on('leftMouseDown', function (e) {
    self.onMouseDown(e);
  });
  window.on('mouseDragged', function (e) {
    self.onMouseDrag(e);
  });
  window.on('leftMouseUp', function (e) {
    self.onMouseUp(e);
  });
};

GUI.prototype.onMouseDown = function (e) {
  this.activeControl = null;
  this.mousePos.set(e.x / this.highdpi - this.x, e.y / this.highdpi - this.y);
  for (var i = 0; i < this.items.length; i++) {
    if (this.items[i].activeArea.contains(this.mousePos)) {
      this.activeControl = this.items[i];
      this.activeControl.active = true;
      this.activeControl.dirty = true;
      if (this.activeControl.type == 'button') {
        this.activeControl.contextObject[this.activeControl.methodName]();
      }
      else if (this.activeControl.type == 'toggle') {
        this.activeControl.contextObject[this.activeControl.attributeName] = !this.activeControl.contextObject[this.activeControl.attributeName];
        if (this.activeControl.onchange) {
          this.activeControl.onchange(this.activeControl.contextObject[this.activeControl.attributeName]);
        }
      }
      else if (this.activeControl.type == 'radiolist') {
        var hitY = this.mousePos.y - this.activeControl.activeArea.y;
        var hitItemIndex = Math.floor(this.activeControl.items.length * hitY / this.activeControl.activeArea.height);
        if (hitItemIndex < 0)
          continue;
        if (hitItemIndex >= this.activeControl.items.length)
          continue;
        this.activeControl.contextObject[this.activeControl.attributeName] = this.activeControl.items[hitItemIndex].value;
        if (this.activeControl.onchange) {
          this.activeControl.onchange(this.activeControl.items[hitItemIndex].value);
        }
      }
      e.handled = true;
      this.onMouseDrag(e);
      break;
    }
  }
};

GUI.prototype.onMouseDrag = function (e) {
  if (this.activeControl) {
    var aa = this.activeControl.activeArea;
    if (this.activeControl.type == 'slider') {
      var val = (e.x / this.highdpi - aa.x) / aa.width;
      val = Math.max(0, Math.min(val, 1));
      this.activeControl.setNormalizedValue(val);
      if (this.activeControl.onchange) {
        this.activeControl.onchange(this.activeControl.contextObject[this.activeControl.attributeName]);
      }
      this.activeControl.dirty = true;
    }
    else if (this.activeControl.type == 'multislider') {
      var val = (e.x / this.highdpi - aa.x) / aa.width;
      val = Math.max(0, Math.min(val, 1));
      var idx = Math.floor(this.activeControl.getValue().length * (e.y / this.highdpi - aa.y) / aa.height);
      if (!isNaN(this.activeControl.clickedSlider)) {
        idx = this.activeControl.clickedSlider;
      }
      else {
        this.activeControl.clickedSlider = idx;
      }
      this.activeControl.setNormalizedValue(val, idx);
      if (this.activeControl.onchange) {
        this.activeControl.onchange(this.activeControl.contextObject[this.activeControl.attributeName]);
      }
      this.activeControl.dirty = true;
    }
    else if (this.activeControl.type == 'vec2') {
      var numSliders = 2;
      var val = (e.x / this.highdpi - aa.x) / aa.width;
      val = Math.max(0, Math.min(val, 1));
      var idx = Math.floor(numSliders * (e.y / this.highdpi - aa.y) / aa.height);
      if (!isNaN(this.activeControl.clickedSlider)) {
        idx = this.activeControl.clickedSlider;
      }
      else {
        this.activeControl.clickedSlider = idx;
      }
      this.activeControl.setNormalizedValue(val, idx);
      if (this.activeControl.onchange) {
        this.activeControl.onchange(this.activeControl.contextObject[this.activeControl.attributeName]);
      }
      this.activeControl.dirty = true;
    }
    else if (this.activeControl.type == 'vec3') {
      var numSliders = 3;
      var val = (e.x / this.highdpi - aa.x) / aa.width;
      val = Math.max(0, Math.min(val, 1));
      var idx = Math.floor(numSliders * (e.y / this.highdpi - aa.y) / aa.height);
      if (!isNaN(this.activeControl.clickedSlider)) {
        idx = this.activeControl.clickedSlider;
      }
      else {
        this.activeControl.clickedSlider = idx;
      }
      this.activeControl.setNormalizedValue(val, idx);
      if (this.activeControl.onchange) {
        this.activeControl.onchange(this.activeControl.contextObject[this.activeControl.attributeName]);
      }
      this.activeControl.dirty = true;
    }
    else if (this.activeControl.type == 'color') {
      var numSliders = this.activeControl.options.alpha ? 4 : 3;
      var val = (e.x / this.highdpi - aa.x) / aa.width;
      val = Math.max(0, Math.min(val, 1));
      var idx = Math.floor(numSliders * (e.y / this.highdpi - aa.y) / aa.height);
      if (!isNaN(this.activeControl.clickedSlider)) {
        idx = this.activeControl.clickedSlider;
      }
      else {
        this.activeControl.clickedSlider = idx;
      }
      this.activeControl.setNormalizedValue(val, idx);
      if (this.activeControl.onchange) {
        this.activeControl.onchange(this.activeControl.contextObject[this.activeControl.attributeName]);
      }
      this.activeControl.dirty = true;
    }
    e.handled = true;
  }
};

GUI.prototype.onMouseUp = function (e) {
  if (this.activeControl) {
    this.activeControl.active = false;
    this.activeControl.dirty = true;
    this.activeControl.clickedSlider = undefined;
    this.activeControl = null;
  }
};

GUI.prototype.addHeader = function (title) {
  var ctrl = new GUIControl({
    type: 'header',
    title: title,
    dirty: true,
    activeArea: new Rect(0, 0, 0, 0),
    setTitle: function (title) {
      this.title = title;
      this.dirty = true;
    }
  });
  this.items.push(ctrl);
  return ctrl;
};

GUI.prototype.addLabel = function (title) {
  var ctrl = new GUIControl({
    type: 'label',
    title: title,
    dirty: true,
    activeArea: new Rect(0, 0, 0, 0),
    setTitle: function (title) {
      this.title = title;
      this.dirty = true;
    }
  });
  this.items.push(ctrl);
  return ctrl;
};

GUI.prototype.addParam = function (title, contextObject, attributeName, options, onchange) {
  options = options || {};
  if (typeof(options.min) == 'undefined') options.min = 0;
  if (typeof(options.max) == 'undefined') options.max = 1;
  if (contextObject[attributeName] instanceof Array) {
    var ctrl = new GUIControl({
      type: 'multislider',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
  else if (contextObject[attributeName] instanceof Vec2) {
    var ctrl = new GUIControl({
      type: 'vec2',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
  else if (contextObject[attributeName] instanceof Vec3) {
    var ctrl = new GUIControl({
      type: 'vec3',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
  else if (contextObject[attributeName] instanceof Color) {
    var ctrl = new GUIControl({
      type: 'color',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
  else if (contextObject[attributeName] instanceof Spline1D) {
    var ctrl = new GUIControl({
      type: 'spline1D',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
  else if (contextObject[attributeName] instanceof Spline2D) {
    var ctrl = new GUIControl({
      type: 'spline2D',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
  else if (contextObject[attributeName] === false || contextObject[attributeName] === true) {
    var ctrl = new GUIControl({
      type: 'toggle',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
  else {
    var ctrl = new GUIControl({
      type: 'slider',
      title: title,
      contextObject: contextObject,
      attributeName: attributeName,
      activeArea: new Rect(0, 0, 0, 0),
      options: options,
      onchange: onchange,
      dirty: true
    });
    this.items.push(ctrl);
    return ctrl;
  }
};

GUI.prototype.addButton = function (title, contextObject, methodName, options) {
  var ctrl = new GUIControl({
    type: 'button',
    title: title,
    contextObject: contextObject,
    methodName: methodName,
    activeArea: new Rect(0, 0, 0, 0),
    dirty: true,
    options: options || {}
  });
  this.items.push(ctrl);
  return ctrl;
};

GUI.prototype.addRadioList = function (title, contextObject, attributeName, items, onchange) {
  var ctrl = new GUIControl({
    type: 'radiolist',
    title: title,
    contextObject: contextObject,
    attributeName: attributeName,
    activeArea: new Rect(0, 0, 0, 0),
    items: items,
    onchange: onchange,
    dirty: true
  });
  this.items.push(ctrl);
  return ctrl;
};

GUI.prototype.addTexture2D = function (title, texture) {
  var ctrl = new GUIControl({
    type: 'texture2D',
    title: title,
    texture: texture,
    activeArea: new Rect(0, 0, 0, 0),
    dirty: true
  });
  this.items.push(ctrl);
  return ctrl;
};

GUI.prototype.dispose = function () {
};

GUI.prototype.draw = function () {
  if (this.items.length === 0) {
    return;
  }
  this.renderer.draw(this.items, this.scale);

  glu.enableDepthReadAndWrite(false, false);

  var gl = Context.currentContext;
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  this.screenImage.draw();
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  this.drawTextures();
};

GUI.prototype.drawTextures = function () {
  //for (var i = 0; i < this.items.length; i++) {
  //  var item = this.items[i];
  //  if (item.type == 'texture2D') {
  //    var bounds = new Rect(item.activeArea.x * this.scale, item.activeArea.y * this.scale, item.activeArea.width * this.scale, item.activeArea.height * this.scale);
  //    this.screenImage.setBounds(bounds);
  //    this.screenImage.setImage(item.texture);
  //    this.screenImage.draw();
  //  }
  //}
  //this.screenImage.setBounds(this.screenBounds);
  //this.screenImage.setImage(this.renderer.getTexture());
};

GUI.prototype.serialize = function () {
  var data = {};
  this.items.forEach(function (item, i) {
    data[item.title] = item.getSerializedValue();
  });
  return data;
};

GUI.prototype.deserialize = function (data) {
  this.items.forEach(function (item, i) {
    if (data[item.title] !== undefined) {
      item.setSerializedValue(data[item.title]);
      item.dirty = true;
    }
  });
};

GUI.prototype.save = function (path) {
  var data = this.serialize();
  IO.saveTextFile(path, JSON.stringify(data));
};

GUI.prototype.load = function (path, callback) {
  var self = this;
  IO.loadTextFile(path, function (dataStr) {
    var data = JSON.parse(dataStr);
    self.deserialize(data);
    if (callback) {
      callback();
    }
  });
};

module.exports = GUI;
},{"./GUIControl":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/GUIControl.js","./HTMLCanvasRenderer":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/HTMLCanvasRenderer.js","./SkiaRenderer":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/SkiaRenderer.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js","pex-sys":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/GUIControl.js":[function(require,module,exports){
function GUIControl(o) {
  for (var i in o) {
    this[i] = o[i];
  }
}

GUIControl.prototype.setPosition = function(x, y) {
  this.px = x;
  this.py = y;
};

GUIControl.prototype.getNormalizedValue = function(idx) {
  if (!this.contextObject) {
    return 0;
  }

  var val = this.contextObject[this.attributeName];
  var options = this.options;
  if (options && options.min !== undefined && options.max !== undefined) {
    if (this.type == 'multislider') {
      val = (val[idx] - options.min) / (options.max - options.min);
    }
    else if (this.type == 'vec2') {
      if (idx == 0) val = val.x;
      if (idx == 1) val = val.y;
      val = (val - options.min) / (options.max - options.min);
    }
    else if (this.type == 'vec3') {
      if (idx == 0) val = val.x;
      if (idx == 1) val = val.y;
      if (idx == 2) val = val.z;
      val = (val - options.min) / (options.max - options.min);
    }
    else if (this.type == 'color') {
      var hsla = val.getHSL();
      if (idx == 0) val = hsla.h;
      if (idx == 1) val = hsla.s;
      if (idx == 2) val = hsla.l;
      if (idx == 3) val = hsla.a;
    }
    else {
      val = (val - options.min) / (options.max - options.min);
    }
  }
  return val;
};

GUIControl.prototype.setNormalizedValue = function(val, idx) {
  if (!this.contextObject) {
    return;
  }

  var options = this.options;
  if (options && options.min !== undefined && options.max !== undefined) {
    if (this.type == 'multislider') {
      var a = this.contextObject[this.attributeName];
      if (idx >= a.length) {
        return;
      }
      a[idx] = options.min + val * (options.max - options.min);
      val = a;
    }
    else if (this.type == 'vec2') {
      var c = this.contextObject[this.attributeName];
      var val = options.min + val * (options.max - options.min);
      if (idx == 0) c.x = val;
      if (idx == 1) c.y = val;
      val = c;
    }
    else if (this.type == 'vec3') {
      var val = options.min + val * (options.max - options.min);
      var c = this.contextObject[this.attributeName];
      if (idx == 0) c.x = val;
      if (idx == 1) c.y = val;
      if (idx == 2) c.z = val;
      val = c;
    }
    else if (this.type == 'color') {
      var c = this.contextObject[this.attributeName];
      var hsla = c.getHSL();
      if (idx == 0) hsla.h = val;
      if (idx == 1) hsla.s = val;
      if (idx == 2) hsla.l = val;
      if (idx == 3) hsla.a = val;
      c.setHSL(hsla.h, hsla.s, hsla.l, hsla.a);
      val = c;
    }
    else {
      val = options.min + val * (options.max - options.min);
    }
    if (options && options.step) {
      val = val - val % options.step;
    }
  }
  this.contextObject[this.attributeName] = val;
};

GUIControl.prototype.getSerializedValue = function() {
  if (this.contextObject) {
    return this.contextObject[this.attributeName];
  }
  else {
    return '';
  }

}

GUIControl.prototype.setSerializedValue = function(value) {
  if (this.type == 'slider') {
    this.contextObject[this.attributeName] = value;
  }
  else if (this.type == 'multislider') {
    this.contextObject[this.attributeName] = value;
  }
  else if (this.type == 'vec2') {
    this.contextObject[this.attributeName].x = value.x;
    this.contextObject[this.attributeName].y = value.y;
  }
  else if (this.type == 'vec3') {
    this.contextObject[this.attributeName].x = value.x;
    this.contextObject[this.attributeName].y = value.y;
    this.contextObject[this.attributeName].z = value.z;
  }
  else if (this.type == 'color') {
    this.contextObject[this.attributeName].r = value.r;
    this.contextObject[this.attributeName].g = value.g;
    this.contextObject[this.attributeName].b = value.b;
    this.contextObject[this.attributeName].a = value.a;
  }
  else if (this.type == 'toggle') {
    this.contextObject[this.attributeName] = value;
  }
  else if (this.type == 'radiolist') {
    this.contextObject[this.attributeName] = value;
  }
}


GUIControl.prototype.getValue = function() {
  if (this.type == 'slider') {
    return this.contextObject[this.attributeName];
  }
  else if (this.type == 'multislider') {
    return this.contextObject[this.attributeName];
  }
  else if (this.type == 'vec2') {
    return this.contextObject[this.attributeName];
  }
  else if (this.type == 'vec3') {
    return this.contextObject[this.attributeName];
  }
  else if (this.type == 'color') {
    return this.contextObject[this.attributeName];
  }
  else if (this.type == 'toggle') {
    return this.contextObject[this.attributeName];
  }
  else {
    return 0;
  }
};

GUIControl.prototype.getStrValue = function() {
  if (this.type == 'slider') {
    var str = '' + this.contextObject[this.attributeName];
    var dotPos = str.indexOf('.') + 1;
    if (dotPos === 0) {
      return str + '.0';
    }
    while (str.charAt(dotPos) == '0') {
      dotPos++;
    }
    return str.substr(0, dotPos + 2);
  }
  else if (this.type == 'vec2') {
    return 'XY';
  }
  else if (this.type == 'vec3') {
    return 'XYZ';
  }
  else if (this.type == 'color') {
    return 'HSLA';
  }
  else if (this.type == 'toggle') {
    return this.contextObject[this.attributeName];
  }
  else {
    return '';
  }
};

module.exports = GUIControl;
GUIControl;
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/HTMLCanvasRenderer.js":[function(require,module,exports){
var glu = require('pex-glu');
var plask = require('plask');
var Context = glu.Context;
var Texture2D = glu.Texture2D;

function HTMLCanvasRenderer(width, height, highdpi) {
  this.gl = Context.currentContext;
  this.highdpi = highdpi || 1;
  this.canvas = document.createElement('canvas');
  this.tex = Texture2D.create(width, height);
  this.canvas.width = width;
  this.canvas.height = height;
  this.ctx = this.canvas.getContext('2d');
  this.dirty = true;
}

HTMLCanvasRenderer.prototype.isAnyItemDirty = function (items) {
  var dirty = false;
  items.forEach(function (item) {
    if (item.dirty) {
      item.dirty = false;
      dirty = true;
    }
  });
  return dirty;
};

HTMLCanvasRenderer.prototype.draw = function (items, scale) {
  if (!this.isAnyItemDirty(items)) {
    return;
  }

  var ctx = this.ctx;
  ctx.save();
  ctx.scale(this.highdpi, this.highdpi);
  ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  ctx.font = '10px Monaco';
  var dy = 10;
  var dx = 10;
  var w = 160;

  for (var i = 0; i < items.length; i++) {
    var e = items[i];

    if (e.px && e.px) {
      dx = e.px / this.highdpi;
      dy = e.py / this.highdpi;
    }

    var eh = 20 * scale;
    if (e.type == 'slider') eh = 20 * scale + 14;
    if (e.type == 'toggle') eh = 20 * scale;
    if (e.type == 'multislider') eh = 18 + e.getValue().length * 20 * scale;
    if (e.type == 'vec2') eh = 20 + 2 * 14 * scale;
    if (e.type == 'vec3') eh = 20 + 3 * 14 * scale;
    if (e.type == 'color') eh = 20 + (e.options.alpha ? 4 : 3) * 14 * scale;
    if (e.type == 'button') eh = 24 * scale;
    if (e.type == 'texture2D') eh = 24 + e.texture.height * w / e.texture.width;
    if (e.type == 'radiolist') eh = 18 + e.items.length * 20 * scale;
    if (e.type == 'spline1D' || e.type == 'spline2D') eh = 24 + w;
    if (e.type == 'header') eh = 26 * scale;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
    ctx.fillRect(dx, dy, w, eh - 2);

    if (e.type == 'slider') {
      ctx.fillStyle = 'rgba(150, 150, 150, 1)';
      ctx.fillRect(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
      ctx.fillStyle = 'rgba(255, 255, 0, 1)';
      ctx.fillRect(dx + 3, dy + 18, (w - 3 - 3) * e.getNormalizedValue(), eh - 5 - 18);
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title + ' : ' + e.getStrValue(), dx + 4, dy + 13);
    }
    else if (e.type == 'vec2') {
      var numSliders = 2;
      for (var j = 0; j < numSliders; j++) {
        ctx.fillStyle = 'rgba(150, 150, 150, 1)';
        ctx.fillRect(dx + 3, dy + 18 + j * 14 * scale, w - 6, 14 * scale - 3);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.fillRect(dx + 3, dy + 18 + j * 14 * scale, (w - 6) * e.getNormalizedValue(j), 14 * scale - 3);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title + ' : ' + e.getStrValue(), dx + 4, dy + 13);
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
     else if (e.type == 'vec3') {
      var numSliders = 3;
      for (var j = 0; j < numSliders; j++) {
        ctx.fillStyle = 'rgba(150, 150, 150, 1)';
        ctx.fillRect(dx + 3, dy + 18 + j * 14 * scale, w - 6, 14 * scale - 3);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.fillRect(dx + 3, dy + 18 + j * 14 * scale, (w - 6) * e.getNormalizedValue(j), 14 * scale - 3);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title + ' : ' + e.getStrValue(), dx + 4, dy + 13);
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'color') {
      var numSliders = e.options.alpha ? 4 : 3;
      for (var j = 0; j < numSliders; j++) {
        ctx.fillStyle = 'rgba(150, 150, 150, 1)';
        ctx.fillRect(dx + 3, dy + 18 + j * 14 * scale, w - 6, 14 * scale - 3);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.fillRect(dx + 3, dy + 18 + j * 14 * scale, (w - 6) * e.getNormalizedValue(j), 14 * scale - 3);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title + ' : ' + e.getStrValue(), dx + 4, dy + 13);
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'button') {
      ctx.fillStyle = e.active ? 'rgba(255, 255, 0, 1)' : 'rgba(150, 150, 150, 1)';
      ctx.fillRect(dx + 3, dy + 3, w - 3 - 3, eh - 5 - 3);
      e.activeArea.set(dx + 3, dy + 3, w - 3 - 3, eh - 5 - 3);
      ctx.fillStyle = e.active ? 'rgba(100, 100, 100, 1)' : 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title, dx + 5, dy + 15);
      if (e.options.color) {
        var c = e.options.color;
        ctx.fillStyle = 'rgba(' + c.x * 255 + ', ' + c.y * 255 + ', ' + c.z * 255 + ', 1)';
        ctx.fillRect(dx + w - 8, dy + 3, 5, eh - 5 - 3);
      }
    }
    else if (e.type == 'toggle') {
      var on = e.contextObject[e.attributeName];
      ctx.fillStyle = on ? 'rgba(255, 255, 0, 1)' : 'rgba(150, 150, 150, 1)';
      ctx.fillRect(dx + 3, dy + 3, eh - 5 - 3, eh - 5 - 3);
      e.activeArea.set(dx + 3, dy + 3, eh - 5 - 3, eh - 5 - 3);
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title, dx + eh, dy + 12);
    }
    else if (e.type == 'radiolist') {
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(e.title, dx + 4, dy + 13);
      var itemHeight = 20 * scale;
      for (var j = 0; j < e.items.length; j++) {
        var item = e.items[j];
        var on = e.contextObject[e.attributeName] == item.value;
        ctx.fillStyle = on ? 'rgba(255, 255, 0, 1)' : 'rgba(150, 150, 150, 1)';
        ctx.fillRect(dx + 3, 18 + j * itemHeight + dy + 3, itemHeight - 5 - 3, itemHeight - 5 - 3);
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.fillText(item.name, dx + 5 + itemHeight - 5, 18 + j * itemHeight + dy + 13);
      }
      e.activeArea.set(dx + 3, 18 + dy + 3, itemHeight - 5, e.items.length * itemHeight - 5);
    }
    else if (e.type == 'texture2D') {
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title, dx + 5, dy + 15);
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'header') {
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillRect(dx + 3, dy + 3, w - 3 - 3, eh - 5 - 3);
      ctx.fillStyle = 'rgba(0, 0, 0, 1)';
      ctx.fillText(items[i].title, dx + 5, dy + 16);
    }
    else {
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillText(items[i].title, dx + 5, dy + 13);
    }
    dy += eh;
  }
  ctx.restore();
  this.updateTexture();
};

HTMLCanvasRenderer.prototype.getTexture = function () {
  return this.tex;
};

HTMLCanvasRenderer.prototype.updateTexture = function () {
  var gl = this.gl;
  this.tex.bind();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
};

module.exports = HTMLCanvasRenderer;

},{"pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js","plask":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/lib/_empty.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-gui/lib/SkiaRenderer.js":[function(require,module,exports){
var glu = require('pex-glu');
var plask = require('plask');
var Context = glu.Context;
var Texture2D = glu.Texture2D;
var SkCanvas = plask.SkCanvas;
var SkPaint = plask.SkPaint;

function SkiaRenderer(width, height, highdpi) {
  this.tex = Texture2D.create(width, height);
  this.highdpi = highdpi || 1;
  this.gl = Context.currentContext;
  this.tex = Texture2D.create(width, height);
  this.canvas = new SkCanvas.create(width, height);
  this.fontPaint = new SkPaint();
  this.fontPaint.setStyle(SkPaint.kFillStyle);
  this.fontPaint.setColor(255, 255, 255, 255);
  this.fontPaint.setTextSize(10);
  this.fontPaint.setFontFamily('Monaco');
  this.fontPaint.setStrokeWidth(0);
  this.headerFontPaint = new SkPaint();
  this.headerFontPaint.setStyle(SkPaint.kFillStyle);
  this.headerFontPaint.setColor(0, 0, 0, 255);
  this.headerFontPaint.setTextSize(10);
  this.headerFontPaint.setFontFamily('Monaco');
  this.headerFontPaint.setStrokeWidth(0);
  this.fontHighlightPaint = new SkPaint();
  this.fontHighlightPaint.setStyle(SkPaint.kFillStyle);
  this.fontHighlightPaint.setColor(100, 100, 100, 255);
  this.fontHighlightPaint.setTextSize(10);
  this.fontHighlightPaint.setFontFamily('Monaco');
  this.fontHighlightPaint.setStrokeWidth(0);
  this.panelBgPaint = new SkPaint();
  this.panelBgPaint.setStyle(SkPaint.kFillStyle);
  this.panelBgPaint.setColor(0, 0, 0, 150);
  this.headerBgPaint = new SkPaint();
  this.headerBgPaint.setStyle(SkPaint.kFillStyle);
  this.headerBgPaint.setColor(255, 255, 255, 255);
  this.controlBgPaint = new SkPaint();
  this.controlBgPaint.setStyle(SkPaint.kFillStyle);
  this.controlBgPaint.setColor(150, 150, 150, 255);
  this.controlHighlightPaint = new SkPaint();
  this.controlHighlightPaint.setStyle(SkPaint.kFillStyle);
  this.controlHighlightPaint.setColor(255, 255, 0, 255);
  this.controlHighlightPaint.setAntiAlias(true);
  this.controlFeaturePaint = new SkPaint();
  this.controlFeaturePaint.setStyle(SkPaint.kFillStyle);
  this.controlFeaturePaint.setColor(255, 255, 255, 255);
  this.controlFeaturePaint.setAntiAlias(true);
}

SkiaRenderer.prototype.isAnyItemDirty = function(items) {
  var dirty = false;
  items.forEach(function(item) {
    if (item.dirty) {
      item.dirty = false;
      dirty = true;
    }
  });
  return dirty;
};

SkiaRenderer.prototype.draw = function(items, scale) {
  if (!this.isAnyItemDirty(items)) {
    return;
  }
  var canvas = this.canvas;
  canvas.save();
  canvas.scale(this.highdpi, this.highdpi);
  canvas.drawColor(0, 0, 0, 0, plask.SkPaint.kClearMode);
  //transparent
  var dy = 10;
  var dx = 10;
  var w = 160;
  for (var i = 0; i < items.length; i++) {
    var e = items[i];
    if (e.px && e.px) {
      dx = e.px / this.highdpi;
      dy = e.py / this.highdpi;
    }
    var eh = 20;

    if (e.type == 'slider') eh = 20 * scale + 14;
    if (e.type == 'toggle') eh = 20 * scale;
    if (e.type == 'multislider') eh = 18 + e.getValue().length * 20 * scale;
    if (e.type == 'vec2') eh = 20 + 2 * 14 * scale;
    if (e.type == 'vec3') eh = 20 + 3 * 14 * scale;
    if (e.type == 'color') eh = 20 + (e.options.alpha ? 4 : 3) * 14 * scale;
    if (e.type == 'button') eh = 24 * scale;
    if (e.type == 'texture2D') eh = 24 + e.texture.height * w / e.texture.width;
    if (e.type == 'radiolist') eh = 18 + e.items.length * 20 * scale;
    if (e.type == 'spline1D' || e.type == 'spline2D') eh = 24 + w;
    if (e.type == 'header') eh = 26 * scale;

    canvas.drawRect(this.panelBgPaint, dx, dy, dx + w, dy + eh - 2);

    if (e.type == 'slider') {
      var value = e.getValue();
      canvas.drawRect(this.controlBgPaint, dx + 3, dy + 18, dx + w - 3, dy + eh - 5);
      canvas.drawRect(this.controlHighlightPaint, dx + 3, dy + 18, dx + 3 + (w - 6) * e.getNormalizedValue(), dy + eh - 5);
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
      canvas.drawText(this.fontPaint, items[i].title + ' : ' + e.getStrValue(), dx + 4, dy + 13);
    }
    else if (e.type == 'multislider') {
      for (var j = 0; j < e.getValue().length; j++) {
        canvas.drawRect(this.controlBgPaint, dx + 3, dy + 18 + j * 20 * scale, dx + w - 3, dy + 18 + (j + 1) * 20 * scale - 6);
        canvas.drawRect(this.controlHighlightPaint, dx + 3, dy + 18 + j * 20 * scale, dx + 3 + (w - 6) * e.getNormalizedValue(j), dy + 18 + (j + 1) * 20 * scale - 6);
      }
      canvas.drawText(this.fontPaint, items[i].title + ' : ' + e.getStrValue(), dx + 4, dy + 13);
      e.activeArea.set(dx + 4, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'vec2') {
      var numSliders = 2;
      for (var j = 0; j < numSliders; j++) {
        canvas.drawRect(this.controlBgPaint, dx + 3, dy + 18 + j * 14 * scale, dx + w - 3, dy + 18 + (j + 1) * 14 * scale - 3);
        canvas.drawRect(this.controlHighlightPaint, dx + 3, dy + 18 + j * 14 * scale, dx + 3 + (w - 6) * e.getNormalizedValue(j), dy + 18 + (j + 1) * 14 * scale - 3);
      }
      canvas.drawText(this.fontPaint, items[i].title + ' : ' + e.getStrValue(), dx + 3, dy + 13);
      e.activeArea.set(dx + 4, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'vec3') {
      var numSliders = 3;
      for (var j = 0; j < numSliders; j++) {
        canvas.drawRect(this.controlBgPaint, dx + 3, dy + 18 + j * 14 * scale, dx + w - 3, dy + 18 + (j + 1) * 14 * scale - 3);
        canvas.drawRect(this.controlHighlightPaint, dx + 3, dy + 18 + j * 14 * scale, dx + 3 + (w - 6) * e.getNormalizedValue(j), dy + 18 + (j + 1) * 14 * scale - 3);
      }
      canvas.drawText(this.fontPaint, items[i].title + ' : ' + e.getStrValue(), dx + 3, dy + 13);
      e.activeArea.set(dx + 4, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'color') {
      var numSliders = e.options.alpha ? 4 : 3;
      for (var j = 0; j < numSliders; j++) {
        canvas.drawRect(this.controlBgPaint, dx + 3, dy + 18 + j * 14 * scale, dx + w - 3, dy + 18 + (j + 1) * 14 * scale - 3);
        canvas.drawRect(this.controlHighlightPaint, dx + 3, dy + 18 + j * 14 * scale, dx + 3 + (w - 6) * e.getNormalizedValue(j), dy + 18 + (j + 1) * 14 * scale - 3);
      }
      canvas.drawText(this.fontPaint, items[i].title + ' : ' + e.getStrValue(), dx + 3, dy + 13);
      e.activeArea.set(dx + 4, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'button') {
      var btnColor = e.active ? this.controlHighlightPaint : this.controlBgPaint;
      var btnFont = e.active ? this.fontHighlightPaint : this.fontPaint;
      canvas.drawRect(btnColor, dx + 3, dy + 3, dx + w - 3, dy + eh - 5);
      e.activeArea.set(dx + 3, dy + 3, w - 3 - 3, eh - 5);
      if (e.options.color) {
        var c = e.options.color;
        this.controlFeaturePaint.setColor(255 * c.x, 255 * c.y, 255 * c.z, 255);
        canvas.drawRect(this.controlFeaturePaint, dx + w - 8, dy + 3, dx + w - 3, dy + eh - 5);
      }
      canvas.drawText(btnFont, items[i].title, dx + 5, dy + 15);
    }
    else if (e.type == 'toggle') {
      var on = e.contextObject[e.attributeName];
      var toggleColor = on ? this.controlHighlightPaint : this.controlBgPaint;
      canvas.drawRect(toggleColor, dx + 3, dy + 3, dx + eh - 5, dy + eh - 5);
      e.activeArea.set(dx + 3, dy + 3, eh - 5, eh - 5);
      canvas.drawText(this.fontPaint, items[i].title, dx + eh, dy + 13);
    }
    else if (e.type == 'radiolist') {
      canvas.drawText(this.fontPaint, e.title, dx + 4, dy + 14);
      var itemColor = this.controlBgPaint;
      var itemHeight = 20 * scale;
      for (var j = 0; j < e.items.length; j++) {
        var item = e.items[j];
        var on = e.contextObject[e.attributeName] == item.value;
        var itemColor = on ? this.controlHighlightPaint : this.controlBgPaint;
        canvas.drawRect(itemColor, dx + 3, 18 + j * itemHeight + dy + 3, dx + itemHeight - 5, itemHeight + j * itemHeight + dy + 18 - 5);
        canvas.drawText(this.fontPaint, item.name, dx + itemHeight, 18 + j * itemHeight + dy + 13);
      }
      e.activeArea.set(dx + 3, 18 + dy + 3, itemHeight - 5, e.items.length * itemHeight - 5);
    }
    else if (e.type == 'texture2D') {
      canvas.drawText(this.fontPaint, e.title, dx + 3, dy + 13);
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, eh - 5 - 18);
    }
    else if (e.type == 'spline1D') {
      canvas.drawText(this.fontPaint, e.title, dx + 3, dy + 13);
      var itemHeight = w;
      var itemColor = this.controlBgPaint;
      canvas.drawRect(itemColor, dx + 3, 18 + dy + 3, dx + itemHeight - 5, itemHeight + dy + 18);
      var path = new plask.SkPath();
      path.moveTo(dx + 3, itemHeight + dy + 18)
      for(var j=0; j<=20; j++) {
        var p = e.contextObject[e.attributeName].getPointAt(j/20);
        var x = j/20 * (w - dx);
        var y = p * itemHeight * 0.99;
        path.lineTo(dx + 3 + x,  itemHeight + dy + 18 - y);
      }
      this.controlHighlightPaint.setStroke();
      canvas.drawPath(this.controlHighlightPaint, path);
      this.controlHighlightPaint.setFill();

      if (typeof(e.contextObject.animParam.highlight) != 'undefined') {
        this.controlFeaturePaint.setStroke();
        canvas.drawLine(this.controlFeaturePaint, dx + 3 + w * e.contextObject.animParam.highlight, 18 + dy + 3, dx + 3 + w * e.contextObject.animParam.highlight, itemHeight + dy + 18);
        this.controlFeaturePaint.setFill();
      }
      e.activeArea.set(dx + 3, dy + 18, w - 3 - 3, w - 5 - 18);
    }
    else if (e.type == 'spline2D') {
      canvas.drawText(this.fontPaint, e.title, dx + 3, dy + 13);
      var itemHeight = w;
      var itemColor = this.controlBgPaint;
      canvas.drawRect(itemColor, dx + 3, 18 + dy + 3, dx + itemHeight - 5, itemHeight + dy + 18);
      var path = new plask.SkPath();
      path.moveTo(dx + 3, itemHeight + dy + 18)
      for(var j=0; j<=40; j++) {
        var p = e.contextObject[e.attributeName].getPointAt(j/40);
        var x = p.x * (w - dx);
        var y = p.y * itemHeight * 0.99;
        path.lineTo(dx + 3 + x,  itemHeight + dy + 18 - y);
      }
      this.controlHighlightPaint.setStroke();
      canvas.drawPath(this.controlHighlightPaint, path);
      this.controlHighlightPaint.setFill();

      if (typeof(e.contextObject.animParam.highlight) != 'undefined') {
        this.controlFeaturePaint.setStroke();
        canvas.drawLine(this.controlFeaturePaint, dx + 3 + w * e.contextObject.animParam.highlight, 18 + dy + 3, dx + 3 + w * e.contextObject.animParam.highlight, itemHeight + dy + 18);
        this.controlFeaturePaint.setFill();
      }
    }
    else if (e.type == 'header') {
      canvas.drawRect(this.headerBgPaint, dx + 3, dy + 3, dx + w - 3, dy + eh - 5);
      canvas.drawText(this.headerFontPaint, items[i].title, dx + 6, dy + 16);
    }
    else {
      canvas.drawText(this.fontPaint, items[i].title, dx + 3, dy + 13);
    }
    dy += eh;
  }
  canvas.restore();
  this.updateTexture();
};

SkiaRenderer.prototype.getTexture = function() {
  return this.tex;
};

SkiaRenderer.prototype.updateTexture = function() {
  var gl = this.gl;
  this.tex.bind();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texImage2DSkCanvas(gl.TEXTURE_2D, 0, this.canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
};

module.exports = SkiaRenderer;
},{"pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js","plask":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/lib/_empty.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/index.js":[function(require,module,exports){
module.exports.SolidColor = require('./lib/SolidColor');
module.exports.ShowNormals = require('./lib/ShowNormals');
module.exports.ShowColors = require('./lib/ShowColors');
module.exports.ShowPosition = require('./lib/ShowPosition');
module.exports.Textured = require('./lib/Textured');
module.exports.TexturedTriPlanar = require('./lib/TexturedTriPlanar');
module.exports.TexturedCubeMap = require('./lib/TexturedCubeMap');
module.exports.TexturedEnvMap = require('./lib/TexturedEnvMap');
module.exports.SkyBox = require('./lib/SkyBox');
module.exports.SkyBoxEnvMap = require('./lib/SkyBoxEnvMap');
module.exports.FlatToonShading = require('./lib/FlatToonShading');
module.exports.MatCap = require('./lib/MatCap');
module.exports.Diffuse = require('./lib/Diffuse');
module.exports.BlinnPhong = require('./lib/BlinnPhong');
module.exports.ShowDepth = require('./lib/ShowDepth');
},{"./lib/BlinnPhong":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/BlinnPhong.js","./lib/Diffuse":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/Diffuse.js","./lib/FlatToonShading":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/FlatToonShading.js","./lib/MatCap":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/MatCap.js","./lib/ShowColors":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowColors.js","./lib/ShowDepth":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowDepth.js","./lib/ShowNormals":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowNormals.js","./lib/ShowPosition":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowPosition.js","./lib/SkyBox":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/SkyBox.js","./lib/SkyBoxEnvMap":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/SkyBoxEnvMap.js","./lib/SolidColor":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/SolidColor.js","./lib/Textured":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/Textured.js","./lib/TexturedCubeMap":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/TexturedCubeMap.js","./lib/TexturedEnvMap":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/TexturedEnvMap.js","./lib/TexturedTriPlanar":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/TexturedTriPlanar.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/BlinnPhong.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var Vec3 = geom.Vec3;
var merge = require('merge');


var BlinnPhongGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 modelWorldMatrix;\nuniform mat4 viewMatrix;\nuniform mat4 normalMatrix;\nuniform float pointSize;\nuniform vec3 lightPos;\nuniform vec3 cameraPos;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 vNormal;\nvarying vec3 vLightPos;\nvarying vec3 vEyePos;\n\nvoid main() {\n  vec4 worldPos = modelWorldMatrix * vec4(position, 1.0);\n  vec4 eyePos = modelViewMatrix * vec4(position, 1.0);\n  gl_Position = projectionMatrix * eyePos;\n  vEyePos = eyePos.xyz;\n  gl_PointSize = pointSize;\n  vNormal = (normalMatrix * vec4(normal, 0.0)).xyz;\n  vLightPos = (viewMatrix * vec4(lightPos, 1.0)).xyz;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform vec4 ambientColor;\nuniform vec4 diffuseColor;\nuniform vec4 specularColor;\nuniform float shininess;\nuniform float wrap;\nuniform bool useBlinnPhong;\nvarying vec3 vNormal;\nvarying vec3 vLightPos;\nvarying vec3 vEyePos;\n\nfloat phong(vec3 L, vec3 E, vec3 N) {\n  vec3 R = reflect(-L, N);\n  return max(0.0, dot(R, E));\n}\n\nfloat blinnPhong(vec3 L, vec3 E, vec3 N) {\n  vec3 halfVec = normalize(L + E);\n  return max(0.0, dot(halfVec, N));\n}\n\nvoid main() {\n  vec3 L = normalize(vLightPos - vEyePos); //lightDir\n  vec3 E = normalize(-vEyePos); //viewDir\n  vec3 N = normalize(vNormal); //normal\n\n  float NdotL = max(0.0, (dot(N, L) + wrap) / (1.0 + wrap));\n  vec4 color = ambientColor + NdotL * diffuseColor;\n\n  float specular = 0.0;\n  if (useBlinnPhong)\n    specular = blinnPhong(L, E, N);\n  else\n    specular = phong(L, E, N);\n\n  color += max(pow(specular, shininess), 0.0) * specularColor;\n\n  gl_FragColor = color;\n}\n\n#endif\n";

function BlinnPhong(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(BlinnPhongGLSL);
  var defaults = {
    wrap: 0,
    pointSize: 1,
    lightPos: Vec3.create(10, 20, 30),
    ambientColor: Color.create(0, 0, 0, 1),
    diffuseColor: Color.create(0.9, 0.9, 0.9, 1),
    specularColor: Color.create(1, 1, 1, 1),
    shininess: 256,
    useBlinnPhong: true
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

BlinnPhong.prototype = Object.create(Material.prototype);

module.exports = BlinnPhong;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/Diffuse.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var Vec3 = geom.Vec3;
var merge = require('merge');


var DiffuseGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 normalMatrix;\nuniform mat4 viewMatrix;\nuniform float pointSize;\nuniform vec3 lightPos;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 vNormal;\nvarying vec3 vLightPos;\nvarying vec3 vPosition;\n\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = pointSize;\n  vNormal = (normalMatrix * vec4(normal, 1.0)).xyz;\n  vLightPos = (viewMatrix * vec4(lightPos, 1.0)).xyz;\n  vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform vec4 ambientColor;\nuniform vec4 diffuseColor;\nuniform float wrap;\nvarying vec3 vNormal;\nvarying vec3 vLightPos;\nvarying vec3 vPosition;\n\nvoid main() {\n  vec3 L = normalize(vLightPos - vPosition);\n  vec3 N = normalize(vNormal);\n  float NdotL = max(0.0, (dot(N, L) + wrap) / (1.0 + wrap));\n  gl_FragColor = ambientColor + NdotL * diffuseColor;\n}\n\n#endif\n";

function Diffuse(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(DiffuseGLSL);
  var defaults = {
    wrap: 0,
    pointSize: 1,
    lightPos: Vec3.create(10, 20, 30),
    ambientColor: Color.create(0, 0, 0, 1),
    diffuseColor: Color.create(1, 1, 1, 1)
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

Diffuse.prototype = Object.create(Material.prototype);

module.exports = Diffuse;
}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/FlatToonShading.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var Vec3 = geom.Vec3;
var merge = require('merge');


var FlatToonShadingGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform float pointSize;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 vNormal;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = pointSize;\n  vNormal = normal;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform vec4 ambientColor;\nuniform vec4 diffuseColor;\nuniform vec3 lightPos;\nuniform sampler2D colorBands;\nuniform float wrap;\nvarying vec3 vNormal;\n\nvoid main() {\n  vec3 L = normalize(lightPos);\n  vec3 N = normalize(vNormal);\n  float NdotL = max(0.0, (dot(N, L) + wrap) / (1.0 + wrap));\n  gl_FragColor = ambientColor + NdotL * diffuseColor;\n  gl_FragColor.rgb = N*0.5 + vec3(0.5);\n  gl_FragColor.rgb = vec3(NdotL);\n\n  gl_FragColor = texture2D(colorBands, vec2(NdotL, 0.5));\n}\n\n#endif\n";

function FlatToonShading(uniforms) {
  this.gl = Context.currentContext.gl;
  var program = new Program(FlatToonShadingGLSL);

  var defaults = {
    wrap: 1,
    pointSize : 1,
    lightPos : Vec3.create(10, 20, 30)
  };

  var uniforms = merge(defaults, uniforms);

  Material.call(this, program, uniforms);
}

FlatToonShading.prototype = Object.create(Material.prototype);

module.exports = FlatToonShading;
}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/MatCap.js":[function(require,module,exports){
(function (__dirname){
//http://www.clicktorelease.com/blog/creating-spherical-environment-mapping-shader

var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var MatCapGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 normalMatrix;\nuniform float pointSize;\nattribute vec3 position;\nattribute vec3 normal;\n\nvarying vec3 e;\nvarying vec3 n;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n\n  e = normalize(vec3(modelViewMatrix * vec4(position, 1.0)));\n  n = normalize(vec3(normalMatrix * vec4(normal, 1.0)));\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform sampler2D texture;\n\nvarying vec3 e;\nvarying vec3 n;\n\nvoid main() {\n  vec3 r = reflect(e, n);\n  float m = 2.0 * sqrt(\n    pow(r.x, 2.0) +\n    pow(r.y, 2.0) +\n    pow(r.z + 1.0, 2.0)\n  );\n  vec2 N = r.xy / m + 0.5;\n  vec3 base = texture2D( texture, N ).rgb;\n  gl_FragColor = vec4( base, 1.0 );\n}\n\n#endif\n";

function MatCap(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(MatCapGLSL);
  var defaults = {};
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

MatCap.prototype = Object.create(Material.prototype);

module.exports = MatCap;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowColors.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var ShowColorsGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform float pointSize;\nattribute vec3 position;\nattribute vec4 color;\nvarying vec4 vColor;\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = pointSize;\n  vColor = color;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec4 vColor;\n\nvoid main() {\n  gl_FragColor = vColor;\n}\n\n#endif\n";

function ShowColors(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(ShowColorsGLSL);
  var defaults = { pointSize: 1 };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

ShowColors.prototype = Object.create(Material.prototype);

module.exports = ShowColors;
}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowDepth.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var Vec3 = geom.Vec3;
var merge = require('merge');


var ShowDepthGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform float near;\nuniform float far;\nuniform vec4 farColor;\nuniform vec4 nearColor;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec4 vColor;\nvoid main() {\n  vec4 pos = modelViewMatrix * vec4(position, 1.0);\n  gl_Position = projectionMatrix * pos;\n  float depth = (length(pos.xyz) - near)/(far - near);\n  vColor.rgb = vec3(depth);\n  vColor.a = length(pos.xyz);\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec4 vColor;\nuniform float far;\n\nvoid main() {\n  gl_FragColor.rgb = vColor.rgb;\n  gl_FragColor.a = vColor.a;\n}\n\n#endif\n";

function ShowDepth(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(ShowDepthGLSL);
  var defaults = {
    near: 0,
    far: 10,
    nearColor: Color.create(0, 0, 0, 1),
    farColor: Color.create(1, 1, 1, 1)
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

ShowDepth.prototype = Object.create(Material.prototype);

module.exports = ShowDepth;
}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowNormals.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var ShowNormalsGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 normalMatrix;\nuniform float pointSize;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec4 vColor;\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = pointSize;\n  vec3 N = normalize((normalMatrix * vec4(normal, 1.0)).xyz);\n  vColor = vec4(N * 0.5 + 0.5, 1.0);\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec4 vColor;\n\nvoid main() {\n  gl_FragColor = vColor;\n}\n\n#endif\n";

function ShowNormals(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(ShowNormalsGLSL);
  var defaults = { pointSize: 1 };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

ShowNormals.prototype = Object.create(Material.prototype);

module.exports = ShowNormals;
}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/ShowPosition.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var Vec3 = geom.Vec3;
var merge = require('merge');


var ShowPositionGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nattribute vec3 position;\nvarying vec4 vColor;\nvoid main() {\n  vec4 pos = modelViewMatrix * vec4(position, 1.0);\n  gl_Position = projectionMatrix * pos;\n  vColor = pos;\n}\n\n#endif\n\n#ifdef FRAG\n\nvarying vec4 vColor;\n\nvoid main() {\n  gl_FragColor = vColor;\n}\n\n#endif\n";

function ShowPosition(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(ShowPositionGLSL);
  var defaults = {
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

ShowPosition.prototype = Object.create(Material.prototype);

module.exports = ShowPosition;
}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/SkyBox.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var SkyBoxGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 vNormal;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  vNormal = position * vec3(1.0, 1.0, 1.0);\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform samplerCube texture;\nvarying vec3 vNormal;\n\nvoid main() {\n  vec3 N = normalize(vNormal);\n  gl_FragColor = textureCube(texture, N);\n}\n\n#endif\n";

function SkyBox(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(SkyBoxGLSL);
  var defaults = {};
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

SkyBox.prototype = Object.create(Material.prototype);

module.exports = SkyBox;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/SkyBoxEnvMap.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var SkyBoxEnvMapGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 vNormal;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  vNormal = position;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform sampler2D texture;\nvarying vec3 vNormal;\n\nvoid main() {\n  vec3 N = normalize(vNormal);\n  vec2 texCoord = vec2((1.0 + atan(-N.z, N.x)/3.14159265359)/2.0, acos(-N.y)/3.14159265359);\n\n  gl_FragColor = texture2D(texture, texCoord);\n}\n\n#endif\n";

function SkyBoxEnvMap(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(SkyBoxEnvMapGLSL);
  var defaults = {};
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

SkyBoxEnvMap.prototype = Object.create(Material.prototype);

module.exports = SkyBoxEnvMap;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/SolidColor.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var SolidColorGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform float pointSize;\nattribute vec3 position;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  gl_PointSize = pointSize;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform vec4 color;\nuniform bool premultiplied;\n\nvoid main() {\n  gl_FragColor = color;\n  if (premultiplied) {\n    gl_FragColor.rgb *= color.a;\n  }\n}\n\n#endif\n";

function SolidColor(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(SolidColorGLSL);
  var defaults = {
    color: Color.create(1, 1, 1, 1),
    pointSize: 1,
    premultiplied: 0
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

SolidColor.prototype = Object.create(Material.prototype);

module.exports = SolidColor;
}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/Textured.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var Vec2 = geom.Vec2;
var merge = require('merge');


var TexturedGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nattribute vec3 position;\nattribute vec2 texCoord;\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  vTexCoord = texCoord;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform sampler2D texture;\nuniform vec2 scale;\nuniform vec4 color;\nvarying vec2 vTexCoord;\n\nvoid main() {\n  gl_FragColor = texture2D(texture, vTexCoord * scale) * color;\n}\n\n#endif\n";

function Textured(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(TexturedGLSL);
  var defaults = {
    scale: new Vec2(1, 1),
    color: new Color(1, 1, 1, 1)
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

Textured.prototype = Object.create(Material.prototype);

module.exports = Textured;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/TexturedCubeMap.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var TexturedCubeMapGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 normalMatrix;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 vTexCoord;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  vTexCoord = (normalMatrix * vec4(normal, 1.0)).xyz;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform samplerCube texture;\nvarying vec3 vTexCoord;\n\nvoid main() {\n  vec3 reflectedDirection = reflect(vec3(0.0, 0.0, 1.0), normalize(vTexCoord));\n  reflectedDirection.y *= -1.0;\n  gl_FragColor = textureCube(texture, reflectedDirection);\n}\n\n#endif\n";

function TexturedCubeMap(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(TexturedCubeMapGLSL);
  var defaults = {};
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

TexturedCubeMap.prototype = Object.create(Material.prototype);

module.exports = TexturedCubeMap;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/TexturedEnvMap.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var merge = require('merge');


var TexturedEnvMapGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 normalMatrix;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 vNormal;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  vNormal = (normalMatrix * vec4(normal, 1.0)).xyz;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform sampler2D texture;\nvarying vec3 vNormal;\n\nvoid main() {\n  vec3 N = normalize(vNormal);\n  vec2 texCoord = vec2((1.0 + atan(-N.z, N.x)/3.14159265359)/2.0, acos(-N.y)/3.14159265359);\n  gl_FragColor = texture2D(texture, texCoord);\n}\n\n#endif\n";

function TexturedEnvMap(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(TexturedEnvMapGLSL);
  var defaults = {};
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

TexturedEnvMap.prototype = Object.create(Material.prototype);

module.exports = TexturedEnvMap;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/lib/TexturedTriPlanar.js":[function(require,module,exports){
(function (__dirname){
var glu = require('pex-glu');
var color = require('pex-color');
var geom = require('pex-geom');
var Context = glu.Context;
var Material = glu.Material;
var Program = glu.Program;
var Color = color.Color;
var Vec3 = geom.Vec3;
var merge = require('merge');


var TexturedTriPlanarGLSL = "#ifdef VERT\n\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nuniform mat4 modelWorldMatrix;\nattribute vec3 position;\nattribute vec3 normal;\nvarying vec3 wcNormal;\nvarying vec3 wcCoords;\n\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n  wcNormal = normal; //this is not correct, shoud go from model -> world\n  wcCoords = (modelWorldMatrix * vec4(position, 1.0)).xyz;\n}\n\n#endif\n\n#ifdef FRAG\n\nuniform sampler2D texture;\nuniform float scale;\nvarying vec3 wcNormal;\nvarying vec3 wcCoords;\n\nvoid main() {\n  vec3 blending = abs( normalize(wcNormal) );\n  blending = normalize(max(blending, 0.00001)); // Force weights to sum to 1.0\n  float b = (blending.x + blending.y + blending.z);\n  blending /= vec3(b, b, b);\n\n  vec4 xaxis = texture2D( texture, wcCoords.zy * scale);\n  vec4 yaxis = texture2D( texture, wcCoords.xz * scale);\n  vec4 zaxis = texture2D( texture, wcCoords.xy * scale);\n  // blend the results of the 3 planar projections.\n  vec4 tex = xaxis * blending.x + yaxis * blending.y + zaxis * blending.z;\n\n  gl_FragColor = tex;\n}\n\n#endif\n";

function TexturedTriPlanar(uniforms) {
  this.gl = Context.currentContext;
  var program = new Program(TexturedTriPlanarGLSL);
  var defaults = {
    scale: 1
  };
  uniforms = merge(defaults, uniforms);
  Material.call(this, program, uniforms);
}

TexturedTriPlanar.prototype = Object.create(Material.prototype);

module.exports = TexturedTriPlanar;

}).call(this,"/node_modules/pex-materials/lib")
},{"merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js","pex-color":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-color/index.js","pex-geom":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-geom/index.js","pex-glu":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-glu/index.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-materials/node_modules/merge/merge.js":[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.1.3
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	function merge() {

		var items = Array.prototype.slice.call(arguments),
			result = items.shift(),
			deep = (result === true),
			size = items.length,
			item, index, key;

		if (deep || typeOf(result) !== 'object')

			result = {};

		for (index=0;index<size;++index)

			if (typeOf(item = items[index]) === 'object')

				for (key in item)

					result[key] = deep ? clone(item[key]) : item[key];

		return result;

	}

	function clone(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = clone(input[index]);

		}

		return output;

	}

	function typeOf(input) {

		return ({}).toString.call(input).match(/\s([\w]+)/)[1].toLowerCase();

	}

	if (isNode) {

		module.exports = merge;

	} else {

		window.merge = merge;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/index.js":[function(require,module,exports){
module.exports.Platform = require('./lib/Platform');
module.exports.Window = require('./lib/Window');
module.exports.Time = require('./lib/Time');
module.exports.IO = require('./lib/IO');
module.exports.Log = require('./lib/Log');
},{"./lib/IO":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/IO.js","./lib/Log":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Log.js","./lib/Platform":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Platform.js","./lib/Time":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Time.js","./lib/Window":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Window.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/BrowserWindow.js":[function(require,module,exports){
var Platform = require('./Platform');
var Log = require('./Log');

var requestAnimFrameFps = 60;

if (Platform.isBrowser) {
  window.requestAnimFrame = function() {
    return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(callback, element) {
      window.setTimeout(callback, 1000 / requestAnimFrameFps);
    };
  }();
}
var eventListeners = [];
function fireEvent(eventType, event) {
  for (var i = 0; i < eventListeners.length; i++) {
    if (eventListeners[i].eventType == eventType) {
      eventListeners[i].handler(event);
    }
  }
}

function registerEvents(canvas) {
  makeMouseDownHandler(canvas);
  makeMouseUpHandler(canvas);
  makeMouseDraggedHandler(canvas);
  makeMouseMovedHandler(canvas);
  makeScrollWheelHandler(canvas);
  makeTouchDownHandler(canvas);
  makeTouchUpHandler(canvas);
  makeTouchMoveHandler(canvas);
  makeKeyDownHandler(canvas);
}

function makeMouseDownHandler(canvas) {
  canvas.addEventListener('mousedown', function(e) {
    fireEvent('leftMouseDown', {
      x: (e.offsetX || e.layerX || e.clientX - e.target.offsetLeft) * window.devicePixelRatio,
      y: (e.offsetY || e.layerY || e.clientY - e.target.offsetTop) * window.devicePixelRatio,
      option: e.altKey,
      shift: e.shiftKey,
      control: e.ctrlKey
    });
  });
}

function makeMouseUpHandler(canvas) {
  canvas.addEventListener('mouseup', function(e) {
    fireEvent('leftMouseUp', {
      x: (e.offsetX || e.layerX || e.clientX - e.target.offsetLeft) * window.devicePixelRatio,
      y: (e.offsetY || e.layerY || e.clientY - e.target.offsetTop) * window.devicePixelRatio,
      option: e.altKey,
      shift: e.shiftKey,
      control: e.ctrlKey
    });
  });
}

function makeMouseDraggedHandler(canvas) {
  var down = false;
  var px = 0;
  var py = 0;
  canvas.addEventListener('mousedown', function(e) {
    down = true;
    px = (e.offsetX || e.layerX || e.clientX - e.target.offsetLeft) * window.devicePixelRatio;
    py = (e.offsetY || e.layerY || e.clientY - e.target.offsetTop) * window.devicePixelRatio;
  });
  canvas.addEventListener('mouseup', function(e) {
    down = false;
  });
  canvas.addEventListener('mousemove', function(e) {
    if (down) {
      var x = (e.offsetX || e.layerX || e.clientX - e.target.offsetLeft) * window.devicePixelRatio;
      var y = (e.offsetY || e.layerY || e.clientY - e.target.offsetTop) * window.devicePixelRatio;
      fireEvent('mouseDragged', {
        x: x,
        y: y,
        dx: x - px,
        dy: y - py,
        option: e.altKey,
        shift: e.shiftKey,
        control: e.ctrlKey
      });
      px = x;
      py = y;
    }
  });
}

function makeMouseMovedHandler(canvas) {
  canvas.addEventListener('mousemove', function(e) {
    fireEvent('mouseMoved', {
      x: (e.offsetX || e.layerX || e.clientX - e.target.offsetLeft) * window.devicePixelRatio,
      y: (e.offsetY || e.layerY || e.clientY - e.target.offsetTop) * window.devicePixelRatio,
      option: e.altKey,
      shift: e.shiftKey,
      control: e.ctrlKey
    });
  });
}

function makeScrollWheelHandler(canvas) {
  var mousewheelevt = /Firefox/i.test(navigator.userAgent) ? 'DOMMouseScroll' : 'mousewheel';
  document.addEventListener(mousewheelevt, function(e) {
    fireEvent('scrollWheel', {
      x: (e.offsetX || e.layerX) * window.devicePixelRatio,
      y: (e.offsetY || e.layerY) * window.devicePixelRatio,
      dy: e.wheelDelta / 10 || -e.detail / 10,
      option: e.altKey,
      shift: e.shiftKey,
      control: e.ctrlKey
    });
  });
}
var lastTouch = null;
function makeTouchDownHandler(canvas) {
  canvas.addEventListener('touchstart', function(e) {
    lastTouch = {
      clientX: e.touches[0].clientX * window.devicePixelRatio,
      clientY: e.touches[0].clientY * window.devicePixelRatio
    };
    var touches = e.touches.map(function(touch) {
      touch.x = touch.clientX * window.devicePixelRatio;
      touch.y = touch.clientY * window.devicePixelRatio;
      return touch;
    });
    fireEvent('leftMouseDown', {
      x: e.touches[0].clientX * window.devicePixelRatio,
      y: e.touches[0].clientY * window.devicePixelRatio,
      option: false,
      shift: false,
      control: false,
      touches: touches
    });
  });
}

function makeTouchUpHandler(canvas) {
  canvas.addEventListener('touchend', function(e) {
    var touches = e.touches.map(function(touch) {
      touch.x = touch.clientX * window.devicePixelRatio;
      touch.y = touch.clientY * window.devicePixelRatio;
      return touch;
    });
    fireEvent('leftMouseUp', {
      x: lastTouch ? lastTouch.clientX : 0,
      y: lastTouch ? lastTouch.clientY : 0,
      option: false,
      shift: false,
      control: false,
      touches: touches
    });
    lastTouch = null;
  });
}

function makeTouchMoveHandler(canvas) {
  canvas.addEventListener('touchmove', function(e) {
    lastTouch = {
      clientX: e.touches[0].clientX * window.devicePixelRatio,
      clientY: e.touches[0].clientY * window.devicePixelRatio
    };
    var touches = e.touches.map(function(touch) {
      touch.x = touch.clientX * window.devicePixelRatio;
      touch.y = touch.clientY * window.devicePixelRatio;
      return touch;
    });
    fireEvent('mouseDragged', {
      x: e.touches[0].clientX * window.devicePixelRatio,
      y: e.touches[0].clientY * window.devicePixelRatio,
      option: false,
      shift: false,
      control: false,
      touches: touches
    });
  });
}

function makeKeyDownHandler(canvas) {
  var timeout = 0;
  window.addEventListener('keydown', function(e) {
    timeout = setTimeout(function() {
      fireEvent('keyDown', {
        str: '',
        keyCode: e.keyCode,
        option: e.altKey,
        shift: e.shiftKey,
        control: e.ctrlKey
      }, 1);
    });
  });
  window.addEventListener('keypress', function(e) {
    if (timeout) {
      clearTimeout(timeout);
      timeout = 0;
    }
    fireEvent('keyDown', {
      str: String.fromCharCode(e.charCode),
      keyCode: e.keyCode,
      option: e.altKey,
      shift: e.shiftKey,
      control: e.ctrlKey
    });
  });
}

function simpleWindow(obj) {
  var canvas = obj.settings.canvas;
  if (obj.settings.fullscreen) {
    obj.settings.width = window.innerWidth;
    obj.settings.height = window.innerHeight;
  }
  if (!canvas) {
    canvas = document.getElementById('canvas');
  }
  else if (obj.settings.width && obj.settings.height) {
    canvas.width = obj.settings.width;
    canvas.height = obj.settings.height;
  }
  else {
    obj.settings.width = canvas.width;
    obj.settings.height = canvas.height;
  }
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = obj.settings.width;
    canvas.height = obj.settings.height;
  }
  if (window.devicePixelRatio == 2) {
    canvas.width = obj.settings.width * 2;
    canvas.height = obj.settings.height * 2;
    canvas.style.width = obj.settings.width + 'px';
    canvas.style.height = obj.settings.height + 'px';
    canvas.msaaEnabled = true;
    canvas.msaaSamples = 2;
    obj.settings.width *= 2;
    obj.settings.height *= 2;
    obj.settings.highdpi = 2;
  }
  obj.width = obj.settings.width;
  obj.height = obj.settings.height;
  obj.canvas = canvas;
  canvas.style.backgroundColor = '#000000';
  function go() {
    if (obj.stencil === undefined)
      obj.stencil = false;
    if (obj.settings.fullscreen) {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';
    }
    var gl = null;
    var ctx = null;
    if (obj.settings.type == '3d') {
      try {
        gl = canvas.getContext('experimental-webgl', { antialias: true, premultipliedAlpha : true, stencil: obj.settings.stencil });
      }
      catch (err) {
        Log.error(err.message);
        return;
      }
      if (gl === null) {
        throw 'No WebGL context is available.';
      }
    }else if (obj.settings.type == '2d') {
      ctx = canvas.getContext('2d');
    }
    obj.framerate = function(fps) {
      requestAnimFrameFps = fps;
    };
    obj.on = function(eventType, handler) {
      eventListeners.push({
        eventType: eventType,
        handler: handler
      });
    };
    registerEvents(canvas);
    obj.dispose = function() {
      obj.__disposed = true;
    };
    obj.gl = gl;
    obj.ctx = ctx;
    obj.init();
    function drawloop() {
      if (!obj.__disposed) {
        obj.draw();
        requestAnimFrame(drawloop);
      }
    }
    requestAnimFrame(drawloop);
  }
  if (!canvas.parentNode) {
    if (document.body) {
      document.body.appendChild(canvas);
      go();
    }else {
      window.addEventListener('load', function() {
        document.body.appendChild(canvas);
        go();
      }, false);
    }
  }
  else {
    go();
  }
  return obj;
}

var BrowserWindow = { simpleWindow: simpleWindow };

module.exports = BrowserWindow;
},{"./Log":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Log.js","./Platform":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Platform.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/IO.js":[function(require,module,exports){
(function (process){
var Platform = require('./Platform');
var Log = require('./Log');
var plask = require('plask');
var path = require('path');

var merge = require('merge');

var PlaskIO = function() {
  function IO() {
  }

  IO.loadTextFile = function (file, callback) {
    var fullPath = path.resolve(IO.getWorkingDirectory(), file);
    if (!fs.existsSync(fullPath)) {
      if (callback) {
        return callback(null);
      }
    }
    var data = fs.readFileSync(fullPath, 'utf8');
    if (callback) {
      callback(data);
    }
  };

  IO.getWorkingDirectory = function () {
    return path.dirname(process.mainModule.filename);
  };

  //textureHandle - texture handl
  //textureTarget - gl.TEXTURE_2D, gl.TEXTURE_CUBE
  //dataTarget - gl.TEXTURE_2D, gl.TEXTURE_CUBE_MAP_POSITIVE_X, gl.TEXTURE_CUBE_MAP_NEGATIVE_X, gl.TEXTURE_CUBE_MAP_POSITIVE_Y, gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, gl.TEXTURE_CUBE_MAP_POSITIVE_Z, gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
  IO.loadImageData = function (gl, textureHandle, textureTarget, dataTarget, file, options, callback) {
    var defaultOptions = { flip: false, lod: 0 };
    options = merge(defaultOptions, options);
    var fullPath = path.resolve(IO.getWorkingDirectory(), file);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(textureTarget, textureHandle);
    var canvas = plask.SkCanvas.createFromImage(fullPath);
    if (options.flip) {
      gl.texImage2DSkCanvas(dataTarget, options.lod, canvas);
    }
    else {
      gl.texImage2DSkCanvasNoFlip(dataTarget, options.lod, canvas);
    }
    if (callback) {
      callback(canvas);
    }
  };

  IO.watchTextFile = function (file, callback) {
    fs.watch(file, {}, function (event, fileName) {
      if (event == 'change') {
        var data = fs.readFileSync(file, 'utf8');
        if (callback) {
          callback(data);
        }
      }
    });
  };

  IO.saveTextFile = function (file, data) {
    fs.writeFileSync(file, data);
  };
  return IO;
};

var WebIO = function () {
  function IO() {
  }

  IO.getWorkingDirectory = function () {
    return '.';
  };

  IO.loadTextFile = function (url, callback) {
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.onreadystatechange = function (e) {
      if (request.readyState == 4) {
        if (request.status == 200) {
          if (callback) {
            callback(request.responseText);
          }
        } else {
          Log.error('WebIO.loadTextFile error : ' + request.statusText);
        }
      }
    };
    request.send(null);
  };

  IO.loadImageData = function (gl, textureHandle, textureTarget, dataTarget, url, options, callback) {
    var defaultOptions = { flip: false, lod: 0 };
    options = merge(defaultOptions, options);
    var image = new Image();
    if (options.crossOrigin) image.crossOrigin = options.crossOrigin;
    image.onload = function () {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(textureTarget, textureHandle);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, options.flip);
      gl.texImage2D(dataTarget, options.lod, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      if (callback) {
        callback(image);
      }
    };
    image.src = url;
  };

  IO.watchTextFile = function () {
    console.log('Warning: WebIO.watch is not implemented!');
  };

  IO.saveTextFile = function (url, data, callback) {
    var request = new XMLHttpRequest();
    request.open('POST', url, true);
    request.onreadystatechange = function (e) {
      if (request.readyState == 4) {
        if (request.status == 200) {
          if (callback) {
            callback(request.responseText, request);
          }
        } else {
          Log.error('WebIO.saveTextFile error : ' + request.statusText);
        }
      }
    };
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    request.send('data=' + encodeURIComponent(data));
  };

  return IO;
};

if (Platform.isPlask) module.exports = PlaskIO();
else if (Platform.isBrowser) module.exports = WebIO();
}).call(this,require('_process'))
},{"./Log":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Log.js","./Platform":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Platform.js","_process":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/node_modules/process/browser.js","merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/node_modules/merge/merge.js","path":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/node_modules/path-browserify/index.js","plask":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/lib/_empty.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Log.js":[function(require,module,exports){
function Log() {
}

Log.message = function(msg) {
  if (console !== undefined) {
    var msgs = Array.prototype.slice.call(arguments);
    console.log(msgs.join(' '));
  }
};

Log.error = function(msg) {
  var msgs = Array.prototype.slice.call(arguments);
  if (console !== undefined) {
    console.log('ERROR: ' + msgs.join(' '));
  }
};

module.exports = Log;
},{}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Platform.js":[function(require,module,exports){
(function (process){
module.exports.isPlask = typeof window === 'undefined' && typeof process === 'object';
module.exports.isBrowser = typeof window === 'object' && typeof document === 'object';
module.exports.isEjecta = typeof ejecta === 'object' && typeof ejecta.include === 'function';

}).call(this,require('_process'))
},{"_process":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/node_modules/process/browser.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Time.js":[function(require,module,exports){
var Log = require('./Log');

var Time = {
    now: 0,
    prev: 0,
    delta: 0,
    seconds: 0,
    frameNumber: 0,
    fpsFrames: 0,
    fpsTime: 0,
    fps: 0,
    fpsFrequency: 3,
    paused: false,
    verbose: false
};

Time.update = function(delta) {
  if (Time.paused) {
    return;
  }

  if (Time.prev === 0) {
    Time.prev = Date.now();
  }

  Time.now = Date.now();
  Time.delta = (delta !== undefined) ? delta : (Time.now - Time.prev) / 1000;

  //More than 1s = probably switched back from another window so we have big jump now
  if (Time.delta > 1) {
    Time.delta = 0;
  }

  Time.prev = Time.now;
  Time.seconds += Time.delta;
  Time.fpsTime += Time.delta;
  Time.frameNumber++;
  Time.fpsFrames++;

  if (Time.fpsTime > Time.fpsFrequency) {
    Time.fps = Time.fpsFrames / Time.fpsTime;
    Time.fpsTime = 0;
    Time.fpsFrames = 0;
    if (this.verbose)
      Log.message('FPS: ' + Time.fps);
  }
  return Time.seconds;

};

var startOfMeasuredTime = 0;

Time.startMeasuringTime = function() {
  startOfMeasuredTime = Date.now();
};

Time.stopMeasuringTime = function(msg) {
  var now = Date.now();
  var seconds = (now - startOfMeasuredTime) / 1000;
  if (msg) {
    console.log(msg + seconds);
  }
  return seconds;
};

Time.pause = function() {
  Time.paused = true;
};

Time.togglePause = function() {
  Time.paused = !Time.paused;
};

module.exports = Time;
},{"./Log":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Log.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Window.js":[function(require,module,exports){
var Platform = require('./Platform');
var BrowserWindow = require('./BrowserWindow');
var Time = require('./Time');
var Log = require('./Log');
var merge = require('merge');
var plask = require('plask');

var DefaultSettings = {
  'width': 1280,
  'height': 720,
  'type': '3d',
  'vsync': true,
  'multisample': true,
  'fullscreen': false,
  'center': true,
  'hdpi': 1,
  'stencil': false
};

var Window = {
  currentWindow: null,
  create: function(obj) {
    obj.settings = obj.settings || {};
    obj.settings = merge(DefaultSettings, obj.settings);

    obj.__init = obj.init;
    obj.init = function() {
      Window.currentWindow = this;
      obj.framerate(60);
      if (obj.__init) {
        obj.__init();
      }
    }

    obj.__draw = obj.draw;
    obj.draw = function() {
      Window.currentWindow = this;
      //FIXME: this will cause Time update n times, where n is number of Window instances opened
      Time.update();
      if (obj.__draw) {
        obj.__draw();
      }
    }

    if (Platform.isPlask) {
      plask.simpleWindow(obj);
    }
    else if (Platform.isBrowser || Platform.isEjecta) {
      BrowserWindow.simpleWindow(obj);
    }
  }
};

module.exports = Window;
},{"./BrowserWindow":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/BrowserWindow.js","./Log":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Log.js","./Platform":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Platform.js","./Time":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/lib/Time.js","merge":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/node_modules/merge/merge.js","plask":"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/browserify/lib/_empty.js"}],"/Users/vorg/Workspace/vorg-pex/experiments/v3/experiments/deferredRendering/node_modules/pex-sys/node_modules/merge/merge.js":[function(require,module,exports){
/*!
 * @name JavaScript/NodeJS Merge v1.1.3
 * @author yeikos
 * @repository https://github.com/yeikos/js.merge

 * Copyright 2014 yeikos - MIT license
 * https://raw.github.com/yeikos/js.merge/master/LICENSE
 */

;(function(isNode) {

	function merge() {

		var items = Array.prototype.slice.call(arguments),
			result = items.shift(),
			deep = (result === true),
			size = items.length,
			item, index, key;

		if (deep || typeOf(result) !== 'object')

			result = {};

		for (index=0;index<size;++index)

			if (typeOf(item = items[index]) === 'object')

				for (key in item)

					result[key] = deep ? clone(item[key]) : item[key];

		return result;

	}

	function clone(input) {

		var output = input,
			type = typeOf(input),
			index, size;

		if (type === 'array') {

			output = [];
			size = input.length;

			for (index=0;index<size;++index)

				output[index] = clone(input[index]);

		} else if (type === 'object') {

			output = {};

			for (index in input)

				output[index] = clone(input[index]);

		}

		return output;

	}

	function typeOf(input) {

		return ({}).toString.call(input).match(/\s([\w]+)/)[1].toLowerCase();

	}

	if (isNode) {

		module.exports = merge;

	} else {

		window.merge = merge;

	}

})(typeof module === 'object' && module && typeof module.exports === 'object' && module.exports);
},{}]},{},["./main.js"]);
