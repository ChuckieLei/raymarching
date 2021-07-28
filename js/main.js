// const scene = new THREE.Scene();
// const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// const renderer = new THREE.WebGLRenderer();
// renderer.setSize(window.innerWidth, window.innerHeight);
// document.body.appendChild(renderer.domElement);

// const geometry = new THREE.SphereGeometry();
// const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
// const cube = new THREE.Mesh(geometry, material);
// scene.add(cube);

// camera.position.z = 5;

// const animate = function () {
//     requestAnimationFrame(animate);

//     cube.rotation.x += 0.01;
//     cube.rotation.y += 0.01;

//     renderer.render(scene, camera);
// };

// animate();
const matcapTextureUrl = "7zhBySIYxEqUFW3.png";
const calcAspect = (el) => el.clientWidth / el.clientHeight;
const getNormalizedMousePos = (e) => {
    return {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1
    };
};

const rayMarchingVertexShader = `
varying vec2 vUv;

void main(){
    vec4 modelPosition=modelMatrix*vec4(position,1.);
    vec4 viewPosition=viewMatrix*modelPosition;
    vec4 projectedPosition=projectionMatrix*viewPosition;
    gl_Position=projectedPosition;
    
    vUv=uv;
}
`;
const rayMarchingFragmentShader = `
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uResolution;
uniform float uVelocityBox;
uniform float uProgress;
uniform float uAngle;
uniform float uDistance;
uniform float uVelocitySphere;
uniform sampler2D uTexture;
uniform vec4 balls[3];
const int NUM_BALLS = 3;

varying vec2 vUv;

const float EPSILON=.0001;
const float PI=3.14159265359;

// https://gist.github.com/yiwenl/3f804e80d0930e34a0b33359259b556c
mat4 rotationMatrix(vec3 axis,float angle){
    axis=normalize(axis);
    float s=sin(angle);
    float c=cos(angle);
    float oc=1.-c;
    
    return mat4(oc*axis.x*axis.x+c,oc*axis.x*axis.y-axis.z*s,oc*axis.z*axis.x+axis.y*s,0.,
        oc*axis.x*axis.y+axis.z*s,oc*axis.y*axis.y+c,oc*axis.y*axis.z-axis.x*s,0.,
        oc*axis.z*axis.x-axis.y*s,oc*axis.y*axis.z+axis.x*s,oc*axis.z*axis.z+c,0.,
    0.,0.,0.,1.);
}

vec3 rotate(vec3 v,vec3 axis,float angle){
    mat4 m=rotationMatrix(axis,angle);
    return(m*vec4(v,1.)).xyz;
}

//创建辐射状背景
vec3 background(vec2 uv){
    float dist=length(uv-vec2(.5));
    vec3 bg=mix(vec3(.3),vec3(.0),dist);
    return bg;
}

// https://www.iquilezles.org/www/articles/distfunctions/distfunctions.htm
float sdSphere(vec3 p,float r)
{
    return length(p)-r;
}

float sdBox(vec3 p,vec3 b)
{
    vec3 q=abs(p)-b;
    return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);
}

// https://www.iquilezles.org/www/articles/smin/smin.htm
float smin(float a,float b,float k)
{
    float h=clamp(.5+.5*(b-a)/k,0.,1.);
    return mix(b,a,h)-k*h*(1.-h);
}

float movingSphere(vec3 p,float shape){
    float rad=uAngle*PI;
    vec3 pos=vec3(cos(rad),sin(rad),0.)*uDistance;
    vec3 displacement=pos*fract(uTime*uVelocitySphere*0.1);
    float gotoCenter=sdSphere(p+displacement,.1);
    return smin(shape,gotoCenter,.3);
}

float sdf(vec3 p){
    //vec3 p1=rotate(p,vec3(1.),uTime*uVelocityBox);
    // float box=sdSphere(p-vec3(0.,sin(uTime*0.1),0.),.3);
    // float sphere=sdSphere(p,.3);
    // float sBox=smin(box,sphere,.3);
    // float mixedBox=mix(sBox,box,uProgress);
    // mixedBox=movingSphere(p,mixedBox);
    // float aspect=uResolution.x/uResolution.y;
    // vec2 mousePos=uMouse;
    // mousePos.x*=aspect;
    // float mouseSphere=sdSphere(p-vec3(mousePos,0.),.15);
    // float mixedBox2 = smin(mixedBox,mouseSphere,.1);

    // float sphere3=sdSphere(p-vec3(0.5,0.5+cos(uTime*0.1),0.),.05);
    // return smin(mixedBox2, sphere3, .1);
    float box=sdSphere(p, balls[0].w);
    float sphere=sdSphere(p-balls[1].xyz, balls[1].w);
    float sBox=smin(box,sphere,.3);
    float mixedBox=mix(sBox, box, uProgress);
    mixedBox=movingSphere(p,mixedBox);
    // for(int i = 2; i < NUM_BALLS; i++) {
    //     vec4 mb = balls[i];
    //     sphere = sdSphere(p-mb.xyz, mb.w);
    //     mixedBox = smin(mixedBox, sphere, .1);
    // }
    return mixedBox;
}

// http://jamie-wong.com/2016/07/15/ray-marching-signed-distance-functions/
// https://gist.github.com/sephirot47/f942b8c252eb7d1b7311
float rayMarch(vec3 eye,vec3 ray,float end,int maxIter){
    float depth=0.;
    for(int i=0;i<maxIter;i++){
        vec3 pos=eye+depth*ray;
        float dist=sdf(pos);
        depth+=dist;
        if(dist<EPSILON||dist>=end){
            break;
        }
    }
    return depth;
}

vec2 centerUv(vec2 uv){
    uv=2.*uv-1.;
    float aspect=uResolution.x/uResolution.y;
    uv.x*=aspect;
    return uv;
}

// https://www.iquilezles.org/www/articles/normalsSDF/normalsSDF.htm
vec3 calcNormal(in vec3 p)
{
    const float eps=.0001;
    const vec2 h=vec2(eps,0);
    return normalize(vec3(sdf(p+h.xyy)-sdf(p-h.xyy),
    sdf(p+h.yxy)-sdf(p-h.yxy),
    sdf(p+h.yyx)-sdf(p-h.yyx)));
}

// https://github.com/hughsk/matcap/blob/master/matcap.glsl
vec2 matcap(vec3 eye,vec3 normal){
    vec3 reflected=reflect(eye,normal);
    float m=2.8284271247461903*sqrt(reflected.z+1.);
    return reflected.xy/m+.5;
}

// https://www.shadertoy.com/view/4scSW4
float fresnel(float bias,float scale,float power,vec3 I,vec3 N)
{
    return bias+scale*pow(1.+dot(I,N),power);
}

void main(){
    vec2 cUv=centerUv(vUv);
    vec3 eye=vec3(0.,0.,2.5);
    vec3 ray=normalize(vec3(cUv,-eye.z));
    vec3 bg=background(vUv);
    vec3 color=bg;
    float end=5.;
    int maxIter=256;
    float depth=rayMarch(eye,ray,end,maxIter);
    if(depth<end){
        vec3 pos=eye+depth*ray;
        vec3 normal=calcNormal(pos);
        vec2 matcapUv=matcap(ray,normal);
        color=texture2D(uTexture,matcapUv).rgb;
        float F=fresnel(0.,.4,3.2,ray,normal);
        color=mix(color,bg,F);
    }
    gl_FragColor=vec4(color,1.);
}
`;

class Base{
    // scene = null;
    // renderer = null;
    // camera = null;
    // cube = null;
    // controls = null;
    // constructor() {
    //     this.orthographicCameraParams = {
    //         zoom: 2,
    //         near: -100,
    //         far: 1000
    //     };
    //     this.cameraPosition = new THREE.Vector3(0, 3, 10);
    //     this.lookAtPosition = new THREE.Vector3(0, 0, 0);
    //     this.rendererParams = {
    //         outputEncoding: THREE.LinearEncoding,
    //         config: {
    //             alpha: true,
    //             antialias: true
    //         }
    //     };
    //     this.mousePos = new THREE.Vector2(0, 0);
    //     this.mouseSpeed = 0;
    //     this.init();
    // }
    constructor(sel, debug = false) {
        this.debug = debug;
        this.container = document.querySelector(sel);
        this.perspectiveCameraParams = {
            fov: 75,
            near: 0.1,
            far: 100
        };
        this.orthographicCameraParams = {
            zoom: 2,
            near: -100,
            far: 1000
        };
        this.cameraPosition = new THREE.Vector3(0, 3, 10);
        this.lookAtPosition = new THREE.Vector3(0, 0, 0);
        this.rendererParams = {
            outputEncoding: THREE.LinearEncoding,
            config: {
                alpha: true,
                antialias: true
            }
        };
        this.mousePos = new THREE.Vector2(0, 0);
        this.mouseSpeed = 0;
    }

    init() {
        // this.createScene();
        // this.createMesh();
        // this.createLight();
        // this.animate();
        // this.createOrbitControls();
        this.createScene();
        this.createPerspectiveCamera();
        this.createRenderer();
        this.createMesh({});
        this.createLight();
        this.createOrbitControls();
        this.addListeners();
        this.setLoop();
    }

    // createScene(){
    //     const scene = new THREE.Scene();
    //     const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    //     const renderer = new THREE.WebGLRenderer();
    //     renderer.setSize(window.innerWidth, window.innerHeight);
    //     document.body.appendChild(renderer.domElement);
    //     renderer.setClearColor(0x000000, 0);

    //     this.scene = scene;
    //     this.camera = camera;
    //     this.renderer = renderer;

    //     camera.position.z = 5;
    // }
    createScene() {
        const scene = new THREE.Scene();
        if (this.debug) {
            scene.add(new THREE.AxesHelper());
            const stats = Stats();
            this.container.appendChild(stats.dom);
            this.stats = stats;
        }
        this.scene = scene;
    }

    createRenderer(useWebGL1 = false) {
        var _a;
        const { rendererParams } = this;
        const { outputEncoding, config } = rendererParams;
        const renderer = !useWebGL1
            ? new THREE.WebGLRenderer(config)
            : new THREE.WebGL1Renderer(config);
        renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        renderer.outputEncoding = outputEncoding;
        // this.resizeRendererToDisplaySize();
        (_a = this.container) === null || _a === void 0 ? void 0 : _a.appendChild(renderer.domElement);
        this.renderer = renderer;
        // this.renderer.setClearColor(0x000000, 0);
    }

    // createMesh(){
    //     const geometry = new THREE.BoxGeometry(1, 1, 1);
    //     const material = new THREE.MeshStandardMaterial({ color: new THREE.Color("#d9dfc8") });
    //     this.cube = new THREE.Mesh(geometry, material);
    //     this.scene.add(this.cube);
    // }
    createMesh(meshObject, container = this.scene) {
        const { geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial({
            color: new THREE.Color("#d9dfc8")
        }), position = new THREE.Vector3(0, 0, 0) } = meshObject;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        container.add(mesh);
        return mesh;
    }

    createLight(){
        const dirLight = new THREE.DirectionalLight(new THREE.Color("#ffffff"), 0.5);
        dirLight.position.set(0, 50, 0);
        this.scene.add(dirLight);
        const ambiLight = new THREE.AmbientLight(new THREE.Color("#ffffff"), 0.4);
        this.scene.add(ambiLight);
    }

    animate(){
        requestAnimationFrame(this.animate.bind(this));
    
        this.cube.rotation.x += 0.01;
        this.cube.rotation.y += 0.01;
    
        this.renderer.render(this.scene, this.camera);
    };

    createOrbitControls() {
        const controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        const { lookAtPosition } = this;
        controls.target.copy(lookAtPosition);
        controls.update();
        this.controls = controls;
    }

    createPerspectiveCamera() {
        const { perspectiveCameraParams, cameraPosition, lookAtPosition } = this;
        const { fov, near, far } = perspectiveCameraParams;
        const aspect = calcAspect(this.container);
        const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        camera.position.copy(cameraPosition);
        camera.lookAt(lookAtPosition);
        this.camera = camera;
    }

    // 创建正交相机
    createOrthographicCamera() {
        const { orthographicCameraParams, cameraPosition, lookAtPosition } = this;
        const { left, right, top, bottom, near, far } = orthographicCameraParams;
        const camera = new THREE.OrthographicCamera(left, right, top, bottom, near, far);
        camera.position.copy(cameraPosition);
        camera.lookAt(lookAtPosition);
        this.camera = camera;
    }
    // 更新正交相机参数
    updateOrthographicCameraParams() {
        const { container } = this;
        const { zoom, near, far } = this.orthographicCameraParams;
        const aspect = calcAspect(container);
        this.orthographicCameraParams = {
            left: -zoom * aspect,
            right: zoom * aspect,
            top: zoom,
            bottom: -zoom,
            near,
            far,
            zoom
        };
    }

    // 追踪鼠标位置
    trackMousePos() {
        window.addEventListener("mousemove", (e) => {
            this.setMousePos(e);
        });
        window.addEventListener("touchstart", (e) => {
            this.setMousePos(e.touches[0]);
        }, { passive: false });
        window.addEventListener("touchmove", (e) => {
            this.setMousePos(e.touches[0]);
        });
    }
    // 设置鼠标位置
    setMousePos(e) {
        const { x, y } = getNormalizedMousePos(e);
        this.mousePos.x = x;
        this.mousePos.y = y;
    }
    // 监听事件
    addListeners() {
        this.onResize();
    }
    // 监听画面缩放
    onResize() {
        window.addEventListener("resize", this.doResize.bind(this));
    }

    doResize() {
        if (this.shaderMaterial) {
            this.shaderMaterial.uniforms.uResolution.value.x = window.innerWidth;
            this.shaderMaterial.uniforms.uResolution.value.y = window.innerHeight;
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
        else {
            if (this.camera instanceof THREE.PerspectiveCamera) {
                const aspect = calcAspect(this.container);
                const camera = this.camera;
                camera.aspect = aspect;
                camera.updateProjectionMatrix();
            }
            else if (this.camera instanceof THREE.OrthographicCamera) {
                this.updateOrthographicCameraParams();
                const camera = this.camera;
                const { left, right, top, bottom, near, far } = this.orthographicCameraParams;
                camera.left = left;
                camera.right = right;
                camera.top = top;
                camera.bottom = bottom;
                camera.near = near;
                camera.far = far;
                camera.updateProjectionMatrix();
            }
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        }
    }

    // 调整渲染器尺寸
    resizeRendererToDisplaySize() {
        const { renderer } = this;
        if (!renderer) {
            return;
        }
        const canvas = renderer.domElement;
        const pixelRatio = window.devicePixelRatio;
        const { clientWidth, clientHeight } = canvas;
        const width = (clientWidth * pixelRatio) | 0;
        const height = (clientHeight * pixelRatio) | 0;
        const isResizeNeeded = canvas.width !== width || canvas.height !== height;
        if (isResizeNeeded) {
            renderer.setSize(width, height, false);
        }
        return isResizeNeeded;
    }

    // 动画
    update() {
        console.log("animation");
    }

    // 渲染
    setLoop() {
        this.renderer.setAnimationLoop(() => {
            this.resizeRendererToDisplaySize();
            this.update();
            if (this.controls) {
                this.controls.update();
            }
            if (this.stats) {
                this.stats.update();
            }
            if (this.composer) {
                this.composer.render();
            }
            else {
                this.renderer.render(this.scene, this.camera);
            }
        });
    }
}

class RayMarching extends Base {
    constructor(sel, debug) {
        super(sel, debug);
        this.clock = new THREE.Clock();
        this.cameraPosition = new THREE.Vector3(0, 0, 0);
    }
    // 初始化
    init() {
        this.createScene();
        this.createOrthographicCamera();
        this.createRenderer();
        this.createRayMarchingMaterial();
        this.createPlane();
        this.createLight();
        this.trackMousePos();
        this.addListeners();
        // this.createDebugPanel();
        this.setLoop();
        this.doResize();
    }
    // 创建光线追踪材质
    createRayMarchingMaterial() {
        const loader = new THREE.TextureLoader();
        const texture = loader.load(matcapTextureUrl);

        var ballsData = [
            {x: 1, y: 1, z: 1, r: 0.01},
            {x: 0.3, y: -0.3, z: 1, r: 0.01},
            {x: -0.3, y: 0.3, z: 1, r: 0.05}
        ] 
        var count = ballsData.length;
        var dataToSendToGPU = new Float32Array(4 * count);
        for (var i = 0; i < count; i++) {
            var baseIndex = 4 * i;
            var mb = ballsData[i];

            dataToSendToGPU[baseIndex + 0] = mb.x;
            dataToSendToGPU[baseIndex + 1] = mb.y;
            dataToSendToGPU[baseIndex + 2] = mb.z;
            dataToSendToGPU[baseIndex + 3] = mb.r;// * animationProperties.radiusMultiplier;
            //dataToSendToGPU[baseIndex + 2] = mb.targRadius * animationProperties.radiusMultiplier;
        }

        const rayMarchingMaterial = new THREE.ShaderMaterial({
            vertexShader: rayMarchingVertexShader,
            fragmentShader: rayMarchingFragmentShader,
            side: THREE.DoubleSide,
            uniforms: {
                uTime: {
                    value: 0
                },
                uMouse: {
                    value: new THREE.Vector2(0, 0)
                },
                uResolution: {
                    value: new THREE.Vector2(window.innerWidth, window.innerHeight)
                },
                uTexture: {
                    value: texture
                },
                uProgress: {
                    value: 1
                },
                uVelocityBox: {
                    value: 0.25
                },
                uVelocitySphere: {
                    value: 0.5
                },
                uAngle: {
                    value: 1.5
                },
                uDistance: {
                    value: 1.2
                },
                balls: {
                    value: dataToSendToGPU
                }
            }
        });
        this.rayMarchingMaterial = rayMarchingMaterial;
        this.shaderMaterial = rayMarchingMaterial;
    }
    // 创建平面
    createPlane() {
        const geometry = new THREE.PlaneBufferGeometry(2, 2, 100, 100);
        const material = this.rayMarchingMaterial;
        this.createMesh({
            geometry,
            material
        });
    }

    getBallData(elapsedTime){
        var ballsData = [
            {x: 1, y: 1, z: 1, r: 0.3},
            {x: 0.3, y: -0.5, z: 0.3, r: 0.3},
            {x: -0.3, y: 0.3, z: 0.3, r: 0.05}
        ] 

        for(let i = 0; i < ballsData.length; i++){
            let ball = ballsData[i];
            if(i == 1){
                ball.y += Math.sin(elapsedTime* 0.1);
            }
        }

        var count = ballsData.length;
        var dataToSendToGPU = new Float32Array(4 * count);
        for (var i = 0; i < count; i++) {
            var baseIndex = 4 * i;
            var mb = ballsData[i];

            dataToSendToGPU[baseIndex + 0] = mb.x;
            dataToSendToGPU[baseIndex + 1] = mb.y;
            dataToSendToGPU[baseIndex + 2] = mb.z;
            dataToSendToGPU[baseIndex + 3] = mb.r;
        }

        return dataToSendToGPU;
    }

    // 动画
    update() {
        const elapsedTime = this.clock.getElapsedTime();
        const mousePos = this.mousePos;
        if (this.rayMarchingMaterial) {
            this.rayMarchingMaterial.uniforms.uTime.value = elapsedTime;
            this.rayMarchingMaterial.uniforms.uMouse.value = mousePos;
            this.rayMarchingMaterial.uniforms.balls.value = this.getBallData(elapsedTime);
        }
    }
    // 创建调试面板
    createDebugPanel() {
        const { rayMarchingMaterial } = this;
        const gui = new dat.GUI({ width: 300 });
        gui
            .add(rayMarchingMaterial.uniforms.uProgress, "value")
            .min(0)
            .max(1)
            .step(0.01)
            .name("progress");
        gui
            .add(rayMarchingMaterial.uniforms.uVelocityBox, "value")
            .min(0)
            .max(1)
            .step(0.01)
            .name("velocityBox");
        gui
            .add(rayMarchingMaterial.uniforms.uVelocitySphere, "value")
            .min(0)
            .max(1)
            .step(0.01)
            .name("velocitySphere");
        gui
            .add(rayMarchingMaterial.uniforms.uAngle, "value")
            .min(0)
            .max(2)
            .step(0.01)
            .name("angle");
        gui
            .add(rayMarchingMaterial.uniforms.uDistance, "value")
            .min(0)
            .max(2)
            .step(0.01)
            .name("distance");
    }
}

const rayMarching =  new RayMarching(".ray-marching");
rayMarching.init();