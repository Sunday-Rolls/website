var e=2048,t=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uCenters;
uniform sampler2D uCovA;
uniform sampler2D uCovB;
uniform sampler2D uColors;
uniform mat3 uW;
uniform vec3 uT;
uniform vec2 uFocal;
uniform vec2 uViewport;

in vec2 aCorner;
in uint aIndex;

out vec4 vColor;
out vec2 vPos;

void main() {
  ivec2 tc = ivec2(int(aIndex % ${e}u), int(aIndex / ${e}u));
  vec3 cam = uW * texelFetch(uCenters, tc, 0).xyz + uT;
  if (cam.z < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }

  vec4 a = texelFetch(uCovA, tc, 0);
  vec2 b = texelFetch(uCovB, tc, 0).xy;
  mat3 V = mat3(a.x, a.y, a.z, a.y, a.w, b.x, a.z, b.x, b.y);

  float iz = 1.0 / cam.z;
  mat3 J = mat3(
    uFocal.x * iz, 0.0, 0.0,
    0.0, uFocal.y * iz, 0.0,
    -uFocal.x * cam.x * iz * iz, -uFocal.y * cam.y * iz * iz, 0.0
  );
  mat3 T = J * uW;
  mat3 cov = T * V * transpose(T);

  float c00 = cov[0][0] + 0.3;
  float c01 = cov[0][1];
  float c11 = cov[1][1] + 0.3;
  float mid = 0.5 * (c00 + c11);
  float radius = length(vec2(0.5 * (c00 - c11), c01));
  float l1 = mid + radius;
  float l2 = max(mid - radius, 0.1);
  vec2 dir = abs(c01) > 1e-6 ? normalize(vec2(c01, l1 - c00)) : (c00 >= c11 ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vec2 major = min(sqrt(2.0 * l1), 1024.0) * dir;
  vec2 minor = min(sqrt(2.0 * l2), 1024.0) * vec2(dir.y, -dir.x);

  vec2 centre = vec2(uFocal.x * cam.x, uFocal.y * cam.y) * iz;
  vec2 offset = aCorner.x * major + aCorner.y * minor;
  gl_Position = vec4((centre + offset) / (0.5 * uViewport), 0.0, 1.0);

  vColor = texelFetch(uColors, tc, 0);
  vPos = aCorner;
}
`,n=`#version 300 es
precision highp float;

in vec4 vColor;
in vec2 vPos;
out vec4 fragColor;

void main() {
  float power = -dot(vPos, vPos);
  if (power < -4.0) discard;
  float alpha = exp(power) * vColor.a;
  if (alpha < 1.0 / 255.0) discard;
  fragColor = vec4(vColor.rgb * alpha, alpha);
}
`,r=class{gl;program;vao;indexBuffer;textures=[];uniforms={};cloud=null;order=new Uint32Array;depthKeys=new Uint16Array;counts=new Uint32Array(65536);lastSortedYaw=NaN;lastSortedPitch=NaN;width=1;height=1;fov=28*Math.PI/180;canvas;constructor(e){this.canvas=e;let r=e.getContext(`webgl2`,{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,powerPreference:`low-power`});if(!r)throw Error(`WebGL2 is not available`);this.gl=r,this.program=a(r,t,n);for(let e of[`uCenters`,`uCovA`,`uCovB`,`uColors`,`uW`,`uT`,`uFocal`,`uViewport`])this.uniforms[e]=r.getUniformLocation(this.program,e);this.vao=r.createVertexArray(),r.bindVertexArray(this.vao);let i=r.createBuffer();r.bindBuffer(r.ARRAY_BUFFER,i),r.bufferData(r.ARRAY_BUFFER,new Float32Array([-2,-2,2,-2,2,2,-2,2]),r.STATIC_DRAW);let o=r.getAttribLocation(this.program,`aCorner`);r.enableVertexAttribArray(o),r.vertexAttribPointer(o,2,r.FLOAT,!1,0,0),this.indexBuffer=r.createBuffer(),r.bindBuffer(r.ARRAY_BUFFER,this.indexBuffer);let s=r.getAttribLocation(this.program,`aIndex`);r.enableVertexAttribArray(s),r.vertexAttribIPointer(s,1,r.UNSIGNED_INT,0,0),r.vertexAttribDivisor(s,1),r.bindVertexArray(null)}setCloud(t){let{gl:n}=this;this.cloud=t;let r=Math.ceil(t.count/e),a=e*r,o=new Float32Array(a*4),s=new Float32Array(a*4),c=new Float32Array(a*4),l=new Uint8Array(a*4);for(let e=0;e<t.count;e++)o.set(t.centers.subarray(e*3,e*3+3),e*4),s.set(t.covariances.subarray(e*6,e*6+4),e*4),c.set(t.covariances.subarray(e*6+4,e*6+6),e*4);l.set(t.colors);for(let e of this.textures)n.deleteTexture(e);this.textures.length=0,this.textures.push(i(n,0,n.RGBA32F,n.RGBA,n.FLOAT,r,o),i(n,1,n.RGBA32F,n.RGBA,n.FLOAT,r,s),i(n,2,n.RGBA32F,n.RGBA,n.FLOAT,r,c),i(n,3,n.RGBA8,n.RGBA,n.UNSIGNED_BYTE,r,l)),this.order=new Uint32Array(t.count),this.depthKeys=new Uint16Array(t.count),n.bindBuffer(n.ARRAY_BUFFER,this.indexBuffer),n.bufferData(n.ARRAY_BUFFER,this.order.byteLength,n.DYNAMIC_DRAW),this.lastSortedYaw=NaN}resize(e,t,n){this.width=Math.max(1,Math.round(e*n)),this.height=Math.max(1,Math.round(t*n)),this.canvas.width!==this.width&&(this.canvas.width=this.width),this.canvas.height!==this.height&&(this.canvas.height=this.height)}render({yaw:e,pitch:t}){let{gl:n,cloud:r}=this;if(n.viewport(0,0,this.width,this.height),n.clearColor(0,0,0,0),n.clear(n.COLOR_BUFFER_BIT),!r||r.count===0)return;let i=Math.cos(e),a=Math.sin(e),o=Math.cos(t),s=Math.sin(t),c=[i,0,a],l=[s*a,o,-s*i],u=[-o*a,s,o*i],d=[-u[0],-u[1],-u[2]],f=Math.tan(this.fov/2),p=this.width/this.height,m=.62/(f*Math.min(1,p))+.5,h=this.height/2/f;(Number.isNaN(this.lastSortedYaw)||Math.abs(e-this.lastSortedYaw)>.01||Math.abs(t-this.lastSortedPitch)>.01)&&(this.sort(d),this.lastSortedYaw=e,this.lastSortedPitch=t),n.useProgram(this.program),n.enable(n.BLEND),n.blendFunc(n.ONE,n.ONE_MINUS_SRC_ALPHA),n.disable(n.DEPTH_TEST),n.uniformMatrix3fv(this.uniforms.uW,!1,[c[0],l[0],d[0],c[1],l[1],d[1],c[2],l[2],d[2]]),n.uniform3f(this.uniforms.uT,0,0,m),n.uniform2f(this.uniforms.uFocal,h,h),n.uniform2f(this.uniforms.uViewport,this.width,this.height),n.uniform1i(this.uniforms.uCenters,0),n.uniform1i(this.uniforms.uCovA,1),n.uniform1i(this.uniforms.uCovB,2),n.uniform1i(this.uniforms.uColors,3),this.textures.forEach((e,t)=>{n.activeTexture(n.TEXTURE0+t),n.bindTexture(n.TEXTURE_2D,e)}),n.bindVertexArray(this.vao),n.drawArraysInstanced(n.TRIANGLE_FAN,0,4,r.count),n.bindVertexArray(null)}sort(e){let{cloud:t,order:n,depthKeys:r,counts:i}=this;if(!t)return;let{centers:a,count:o}=t,s=1/0,c=-1/0,l=new Float32Array(o);for(let t=0;t<o;t++){let n=e[0]*a[t*3]+e[1]*a[t*3+1]+e[2]*a[t*3+2];l[t]=n,n<s&&(s=n),n>c&&(c=n)}let u=c>s?65535/(c-s):0;i.fill(0);for(let e=0;e<o;e++){let t=(c-l[e])*u|0;r[e]=t,i[t]++}for(let e=1;e<65536;e++)i[e]+=i[e-1];for(let e=o-1;e>=0;e--)n[--i[r[e]]]=e;let{gl:d}=this;d.bindBuffer(d.ARRAY_BUFFER,this.indexBuffer),d.bufferSubData(d.ARRAY_BUFFER,0,n)}dispose(){let{gl:e}=this;for(let t of this.textures)e.deleteTexture(t);e.deleteBuffer(this.indexBuffer),e.deleteVertexArray(this.vao),e.deleteProgram(this.program),e.getExtension(`WEBGL_lose_context`)?.loseContext()}};function i(t,n,r,i,a,o,s){let c=t.createTexture();return t.activeTexture(t.TEXTURE0+n),t.bindTexture(t.TEXTURE_2D,c),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texImage2D(t.TEXTURE_2D,0,r,e,o,0,i,a,s),c}function a(e,t,n){let r=(t,n)=>{let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw Error(`splat shader: ${e.getShaderInfoLog(r)}`);return r},i=e.createProgram();if(e.attachShader(i,r(e.VERTEX_SHADER,t)),e.attachShader(i,r(e.FRAGMENT_SHADER,n)),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw Error(`splat program: ${e.getProgramInfoLog(i)}`);return i}export{r as SplatRenderer};