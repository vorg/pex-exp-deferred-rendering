var FXStage = require('pex-fx').FXStage;
var fs = require('fs');

var DeferredGLSL = fs.readFileSync(__dirname + '/Deferred.glsl', 'utf8');

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
  this.drawFullScreenQuad(outputSize.width, outputSize.height, null, program);
  rt.unbind();
  return this.asFXStage(rt, 'pbr');
};

module.exports = FXStage;