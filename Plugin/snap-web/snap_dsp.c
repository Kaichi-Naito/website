// SNAP Web DSP core — updated from SNAP v0.4.95 PluginProcessor DSP.
// Browser-oriented standalone core: Gate -> Compressor -> Drive/SNAP -> 10-band EQ.
// CAB convolution is performed by Web Audio ConvolverNodes using the same IR WAVs.
// Browser-only constraints remain MONO + DRIVE CPU LOW (4x); DSP voicing follows v0.4.95.

// Freestanding WebAssembly build: math functions are imported from JavaScript.
extern double exp(double);
extern double pow(double, double);
extern double tanh(double);
extern double sinh(double);
extern double cosh(double);
extern double asinh(double);
extern double log(double);

#define MAX_FRAMES 128
#define MAX_COMP_DELAY 1024
#define NUM_CH 2
#define NUM_EQ 10
#define PI 3.1415926535897932384626433832795
#define LN10 2.3025850929940456840179914546844

static float inL[MAX_FRAMES], inR[MAX_FRAMES], outL[MAX_FRAMES], outR[MAX_FRAMES];

static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }
static double clampd(double x, double lo, double hi) { return x < lo ? lo : (x > hi ? hi : x); }
static float absf(float x) { return x < 0.0f ? -x : x; }
static double absd(double x) { return x < 0.0 ? -x : x; }
static int finitef(float x) { return x == x && x < 3.4e38f && x > -3.4e38f; }
static int finited(double x) { return x == x && x < 1.7e308 && x > -1.7e308; }
static float db_to_gain(float db) { return (float)pow(10.0, (double)db / 20.0); }
static float gain_to_db(float g, float floorDb) {
    if (g <= 0.0f) return floorDb;
    double db = 20.0 * log((double)g) / LN10;
    return db < floorDb ? floorDb : (float)db;
}
static float one_lp(float x, float* state, float c) {
    *state += c * (x - *state);
    return *state;
}
static float one_hp(float x, float* prevIn, float* prevOut, float c) {
    float y = c * (*prevOut + x - *prevIn);
    *prevIn = x; *prevOut = y; return y;
}
static float smooth_to(float current, float target, float coeff) {
    return current + coeff * (target - current);
}

// Parameter ids shared with snap-web.js.
enum {
    P_INPUT_TRIM = 0, P_GATE = 1, P_COMP = 2, P_COMP_VOL = 3, P_COMP_TONE = 4, P_COMP_ON = 5,
    P_DRIVE = 6, P_SNAP = 7, P_TONE = 8, P_LEVEL = 9, P_DRIVE_ON = 10, P_BOOST = 11,
    P_EQ_ON = 12, P_EQ31 = 13, P_EQ62 = 14, P_EQ125 = 15, P_EQ250 = 16, P_EQ500 = 17,
    P_EQ1K = 18, P_EQ2K = 19, P_EQ4K = 20, P_EQ8K = 21, P_EQ16K = 22, P_EQ_OUT = 23,
    P_SIGNAL_MODE = 24, P_DRIVE_CPU_HIGH = 25,
    P_DEV_DIRECT_OFF = 26, P_DEV_TRANSIENT_OFF = 27, P_DEV_DIRECT_ON = 28, P_DEV_TRANSIENT_ON = 29,
    P_DEV_NATURAL_COMP = 30, P_DEV_DRIVE_CLIP_DB = 31, P_DEV_DRIVE_LOW_CUT_HZ = 32, P_DEV_DRIVE_HIGH_CUT_HZ = 33
};

typedef struct {
    float inputTrim, gate, comp, compVol, compTone;
    float compOn, drive, snap, tone, level, driveOn, boost;
    float eqOn, eq[NUM_EQ], eqOut;
    float signalMode, driveCpuHigh;
    float devDirectOff, devTransientOff, devDirectOn, devTransientOn;
    float devNaturalComp, devDriveClipDb, devDriveLowCutHz, devDriveHighCutHz;
} Params;

static Params p;
static float sr = 48000.0f;

// Smoothed controls.
static float sInputTrim, sGate, sComp, sCompVol, sCompTone;
static float sDrive, sSnap, sTone, sLevel, sBoost;
static float sDevDirectOff, sDevTransientOff, sDevDirectOn, sDevTransientOn;
static float sDevDriveClipDb, sDevDriveLowCutHz, sDevDriveHighCutHz;
static float baseSmoothCoeff = 0.001f;

// Gate.
static float gateDetectorEnvelope, gateGain;
static float gateDetectorAttackCoeff, gateDetectorReleaseCoeff, gateOpenCoeff, gateCloseCoeff;
static int gateHoldSamples, gateHoldRemaining, gateIsOpen;

// Compressor.
typedef struct {
    float hp1In, hp1Out, hp2In, hp2Out;
    float detectorHpIn, detectorHpOut;
    float detectorRmsSquared;
    float toneLp;
} CompState;
static CompState compState[NUM_CH];
static float compDelay[NUM_CH][MAX_COMP_DELAY];
static int compDelaySize, compMaxLookahead, compWrite;
static float compGainReductionDb;
static float compAttackCoeff, compReleaseCoeff, compRmsCoeff;

// Drive.
typedef struct {
    float inputHp1In, inputHp1Out, inputHp2In, inputHp2Out;
    float inputHp3In, inputHp3Out, inputHp4In, inputHp4Out;
    float attackHpIn, attackHpOut;
    float transientFastEnvelope, transientSlowEnvelope, transientPunchEnvelope;
    float transientBandHpIn, transientBandHpOut, transientBandLp;
    float snapBell1, snapBell2;
    float feedbackVoltage;
    float fixedPost, tone1, tone2, sheen, dcIn, dcOut;
    float body125_1, body125_2, body250_1, body250_2;
    float interpPrev;
} DriveState;
static DriveState driveState[NUM_CH];

// EQ biquads.
typedef struct { float b0,b1,b2,a1,a2,z1,z2; } Biquad;
static Biquad eqState[NUM_CH][NUM_EQ];
static const float eqFreq[NUM_EQ] = {31.25f,62.5f,125.0f,250.0f,500.0f,1000.0f,2000.0f,4000.0f,8000.0f,16000.0f};

static float inputPeakDb = -60.0f;

static void clear_states(void) {
    int ch, i, b;
    gateDetectorEnvelope = 0.0f; gateGain = 1.0f; gateHoldRemaining = 0; gateIsOpen = 1;
    compWrite = 0; compGainReductionDb = 0.0f;
    for (ch=0; ch<NUM_CH; ++ch) {
        CompState* cs=&compState[ch];
        cs->hp1In=cs->hp1Out=cs->hp2In=cs->hp2Out=0.0f;
        cs->detectorHpIn=cs->detectorHpOut=cs->detectorRmsSquared=cs->toneLp=0.0f;
        for (i=0;i<MAX_COMP_DELAY;++i) compDelay[ch][i]=0.0f;
        DriveState* ds=&driveState[ch];
        ds->inputHp1In=ds->inputHp1Out=ds->inputHp2In=ds->inputHp2Out=0.0f;
        ds->inputHp3In=ds->inputHp3Out=ds->inputHp4In=ds->inputHp4Out=0.0f;
        ds->attackHpIn=ds->attackHpOut=0.0f;
        ds->transientFastEnvelope=ds->transientSlowEnvelope=ds->transientPunchEnvelope=0.0f;
        ds->transientBandHpIn=ds->transientBandHpOut=ds->transientBandLp=0.0f;
        ds->snapBell1=ds->snapBell2=0.0f; ds->feedbackVoltage=0.0f; ds->fixedPost=ds->tone1=ds->tone2=ds->sheen=0.0f;
        ds->body125_1=ds->body125_2=ds->body250_1=ds->body250_2=0.0f;
        ds->dcIn=ds->dcOut=ds->interpPrev=0.0f;
        for (b=0;b<NUM_EQ;++b) { eqState[ch][b].z1=eqState[ch][b].z2=0.0f; }
    }
}

static float gate_threshold_db(float amount) {
    float remapped = clampf(amount * 6.0f / 10.0f, 0.0f, 6.0f);
    float n = remapped / 10.0f;
    if (n <= 0.0001f) return -1000.0f;
    return -78.0f + 50.0f * (float)pow((double)n, 0.72);
}

static float comp_gr_db(float detectorDb, float thresholdDb, float ratio) {
    float diff=detectorDb-thresholdDb, halfKnee=3.0f, slope=1.0f-(1.0f/ratio);
    if (diff <= -halfKnee) return 0.0f;
    if (diff >= halfKnee) return -diff*slope;
    float kp=diff+halfKnee;
    return -slope*kp*kp/12.0f;
}

static float lookup_comp_curve(float n, const float* values) {
    float scaled=clampf(n,0,1)*10.0f;
    int lo=(int)scaled; if(lo<0)lo=0; if(lo>9)lo=9;
    int hi=lo+1; if(hi>10)hi=10;
    float t=clampf(scaled-(float)lo,0,1); float st=t*t*(3-2*t);
    return values[lo]+(values[hi]-values[lo])*st;
}

static float fixed_makeup_db(float n) {
    static const float pos[12]={0,.1f,.2f,.3f,.4f,.5f,.6f,.7f,.8f,.85f,.9f,1};
    static const float val[12]={0,0,0,.06f,.82f,2.91f,4.5f,7,11,16,22,60};
    n=clampf(n,0,1);
    int i; for(i=0;i<11;++i){ if(n<=pos[i+1]){ float span=pos[i+1]-pos[i]; float t=span>0?(n-pos[i])/span:0; t=clampf(t,0,1); float st=t*t*(3-2*t); return val[i]+(val[i+1]-val[i])*st; }}
    return 60.0f;
}

// 1N4148-inspired feedback solver copied from v0.4.80 equations.
static double diode_current(double v) {
    const double Is=2.52e-9, scale=1.752*0.02585;
    double a=clampd(v/scale,-18.0,18.0);
    return 2.0*Is*sinh(a);
}
static double diode_derivative(double v) {
    const double Is=2.52e-9, scale=1.752*0.02585;
    double a=clampd(v/scale,-18.0,18.0);
    return (2.0*Is/scale)*cosh(a);
}
static float solve_feedback(float attackCurrent, float feedbackR, float capG, float prevF) {
    const double Is=2.52e-9, scale=1.752*0.02585;
    double R=feedbackR<1000?1000:feedbackR, cg=capG<0?0:capG;
    double prev=finitef(prevF)?prevF:0;
    double target=(double)attackCurrent+cg*prev;
    double linearG=1.0/R+cg;
    double linearEstimate=target/(linearG>1e-12?linearG:1e-12);
    double denom=2.0*Is; if(denom<1e-18)denom=1e-18;
    double diodeEstimate=scale*asinh(target/denom);
    double mag=absd(linearEstimate)<absd(diodeEstimate)?absd(linearEstimate):absd(diodeEstimate);
    double inv=(target<0?-1:1)*clampd(mag,0,0.95);
    double prevC=clampd(prev,-0.95,0.95);
    double rPrev=absd(linearG*prevC+diode_current(prevC)-target);
    double rInv=absd(linearG*inv+diode_current(inv)-target);
    double v=rPrev<=rInv?prevC:inv;
    int valid=finited(v), it;
    for(it=0;it<5 && valid;++it){
        double fv=linearG*v+diode_current(v)-target;
        double der=linearG+diode_derivative(v); if(der<1e-10)der=1e-10;
        double step=clampd(fv/der,-0.95,0.95);
        double nv=clampd(v-step,-0.95,0.95); valid=finited(nv); v=nv;
        if(absd(step)<1e-8)break;
    }
    double resid=valid?absd(linearG*v+diode_current(v)-target):1e100;
    if(!valid || resid>=1e-6 || !finited(v)){
        double lo=-0.95,hi=0.95;
        for(it=0;it<18;++it){ double mid=.5*(lo+hi); double mv=linearG*mid+diode_current(mid)-target; if(mv>0)hi=mid;else lo=mid; }
        v=.5*(lo+hi);
        if(!finited(v)){ double m=absd(linearEstimate)<absd(diodeEstimate)?absd(linearEstimate):absd(diodeEstimate); v=(target<0?-1:1)*clampd(m,0,.95); }
    }
    return (float)v;
}

static void update_eq_coeff(int band, float gainDb) {
    float f=eqFreq[band]; float nyq=.45f*sr; if(f>nyq)f=nyq; if(f<20)f=20;
    double A=pow(10.0,(double)gainDb/40.0);
    double w0=2.0*PI*(double)f/(double)sr;
    // sin/cos via imported exp are not available; use compact polynomial recurrence helpers below.
    // We import sin/cos via JS as well (declared locally here).
    extern double sin(double); extern double cos(double); extern double sqrt(double);
    double alpha=sin(w0)/(2.0*1.1);
    double c=cos(w0);
    double b0=1+alpha*A, b1=-2*c, b2=1-alpha*A;
    double a0=1+alpha/A, a1=-2*c, a2=1-alpha/A;
    int ch; for(ch=0;ch<NUM_CH;++ch){ Biquad* q=&eqState[ch][band]; q->b0=(float)(b0/a0); q->b1=(float)(b1/a0); q->b2=(float)(b2/a0); q->a1=(float)(a1/a0); q->a2=(float)(a2/a0); }
}
static float biquad_process(Biquad* q,float x){ float y=q->b0*x+q->z1; q->z1=q->b1*x-q->a1*y+q->z2; q->z2=q->b2*x-q->a2*y; return y; }
typedef struct { float b0,b1,b2,a1,a2; } PeakCoeff5;
static PeakCoeff5 make_peak5(float freq,float q,float gainDb,float rate){
    extern double sin(double); extern double cos(double);
    float f=clampf(freq,20.0f,rate*0.45f);
    double A=pow(10.0,(double)gainDb/40.0), w=2.0*PI*(double)f/(double)rate;
    double al=sin(w)/(2.0*(double)q), co=cos(w), a0=1.0+al/A;
    PeakCoeff5 r={(float)((1+al*A)/a0),(float)((-2*co)/a0),(float)((1-al*A)/a0),(float)((-2*co)/a0),(float)((1-al/A)/a0)}; return r;
}
static float peak5_process(PeakCoeff5 q,float x,float* z1,float* z2){ float y=q.b0*x+*z1; *z1=q.b1*x-q.a1*y+*z2; *z2=q.b2*x-q.a2*y; return y; }


static void init_params(void){
    p.inputTrim=0; p.gate=1; p.comp=5; p.compVol=5; p.compTone=5; p.compOn=1;
    p.drive=5; p.snap=5; p.tone=5; p.level=5; p.driveOn=1; p.boost=0;
    p.eqOn=0; int i; for(i=0;i<NUM_EQ;++i)p.eq[i]=0; p.eqOut=0;
    p.signalMode=0; p.driveCpuHigh=0;
    p.devDirectOff=100; p.devTransientOff=100; p.devDirectOn=0; p.devTransientOn=50;
    p.devNaturalComp=1.0f; p.devDriveClipDb=-9.2f; p.devDriveLowCutHz=99.5f; p.devDriveHighCutHz=5150.0f;
    sInputTrim=p.inputTrim; sGate=p.gate; sComp=p.comp; sCompVol=p.compVol; sCompTone=p.compTone;
    sDrive=p.drive; sSnap=p.snap; sTone=p.tone; sLevel=p.level; sBoost=p.boost;
    sDevDirectOff=p.devDirectOff; sDevTransientOff=p.devTransientOff; sDevDirectOn=p.devDirectOn; sDevTransientOn=p.devTransientOn;
    sDevDriveClipDb=p.devDriveClipDb; sDevDriveLowCutHz=p.devDriveLowCutHz; sDevDriveHighCutHz=p.devDriveHighCutHz;
}

__attribute__((export_name("snap_init"))) void snap_init(float sampleRate){
    sr=sampleRate>8000?sampleRate:48000;
    init_params(); clear_states();
    baseSmoothCoeff=1.0f-(float)exp(-1.0/(0.025*(double)sr));
    compMaxLookahead=(int)(sr*0.002f+0.5f); if(compMaxLookahead<1)compMaxLookahead=1; if(compMaxLookahead>MAX_COMP_DELAY-MAX_FRAMES-2)compMaxLookahead=MAX_COMP_DELAY-MAX_FRAMES-2;
    compDelaySize=compMaxLookahead+MAX_FRAMES+2; if(compDelaySize>MAX_COMP_DELAY)compDelaySize=MAX_COMP_DELAY;
    compAttackCoeff=(float)exp(-1.0/(0.00005*(double)sr));
    compReleaseCoeff=(float)exp(-1.0/(0.010*(double)sr));
    compRmsCoeff=(float)exp(-1.0/(0.005*(double)sr));
    gateHoldSamples=(int)(sr*0.006f+0.5f); if(gateHoldSamples<1)gateHoldSamples=1; gateHoldRemaining=gateHoldSamples;
    gateDetectorAttackCoeff=(float)exp(-1.0/(0.00004*(double)sr));
    gateDetectorReleaseCoeff=(float)exp(-1.0/(0.008*(double)sr));
    gateOpenCoeff=(float)exp(-1.0/(0.00008*(double)sr));
    gateCloseCoeff=(float)exp(-1.0/(0.018*(double)sr));
    int b; for(b=0;b<NUM_EQ;++b)update_eq_coeff(b,0.0f);
}

__attribute__((export_name("snap_reset"))) void snap_reset(void){ clear_states(); }

__attribute__((export_name("snap_set_param"))) void snap_set_param(int id,float v){
    switch(id){
        case P_INPUT_TRIM:p.inputTrim=clampf(v,-18,18);break;
        case P_GATE:p.gate=clampf(v,0,10);break;
        case P_COMP:p.comp=clampf(v,0,10);break;
        case P_COMP_VOL:p.compVol=clampf(v,0,10);break;
        case P_COMP_TONE:p.compTone=clampf(v,0,10);break;
        case P_COMP_ON:p.compOn=v>0.5f;break;
        case P_DRIVE:p.drive=clampf(v,0,10);break;
        case P_SNAP:p.snap=clampf(v,0,10);break;
        case P_TONE:p.tone=clampf(v,0,10);break;
        case P_LEVEL:p.level=clampf(v,0,10);break;
        case P_DRIVE_ON:p.driveOn=v>0.5f;break;
        case P_BOOST:p.boost=v>0.5f;break;
        case P_EQ_ON:p.eqOn=v>0.5f;break;
        case P_EQ31:case P_EQ62:case P_EQ125:case P_EQ250:case P_EQ500:case P_EQ1K:case P_EQ2K:case P_EQ4K:case P_EQ8K:case P_EQ16K:{ int b=id-P_EQ31; p.eq[b]=clampf(v,-12,12); update_eq_coeff(b,p.eq[b]); break; }
        case P_EQ_OUT:p.eqOut=clampf(v,-18,18);break;
        case P_SIGNAL_MODE:p.signalMode=v>=0.5f?1.0f:0.0f;break;
        case P_DRIVE_CPU_HIGH:p.driveCpuHigh=v>0.5f;break;
        case P_DEV_DIRECT_OFF:p.devDirectOff=clampf(v,0,100);break;
        case P_DEV_TRANSIENT_OFF:p.devTransientOff=clampf(v,0,100);break;
        case P_DEV_DIRECT_ON:p.devDirectOn=clampf(v,0,100);break;
        case P_DEV_TRANSIENT_ON:p.devTransientOn=clampf(v,0,100);break;
        case P_DEV_NATURAL_COMP:p.devNaturalComp=clampf(v,0,2);break;
        case P_DEV_DRIVE_CLIP_DB:p.devDriveClipDb=clampf(v,-24,24);break;
        case P_DEV_DRIVE_LOW_CUT_HZ:p.devDriveLowCutHz=clampf(v,10,300);break;
        case P_DEV_DRIVE_HIGH_CUT_HZ:p.devDriveHighCutHz=clampf(v,1500,30000);break;
    }
}

__attribute__((export_name("snap_get_input_l"))) unsigned int snap_get_input_l(void){ return (unsigned int)(unsigned long)inL; }
__attribute__((export_name("snap_get_input_r"))) unsigned int snap_get_input_r(void){ return (unsigned int)(unsigned long)inR; }
__attribute__((export_name("snap_get_output_l"))) unsigned int snap_get_output_l(void){ return (unsigned int)(unsigned long)outL; }
__attribute__((export_name("snap_get_output_r"))) unsigned int snap_get_output_r(void){ return (unsigned int)(unsigned long)outR; }
__attribute__((export_name("snap_get_input_peak_db"))) float snap_get_input_peak_db(void){ return inputPeakDb; }
__attribute__((export_name("snap_get_gate_closed"))) int snap_get_gate_closed(void){ return (p.gate > 0.01f && !gateIsOpen) ? 1 : 0; }

static void process_gate(float* L,float* R,int n){
    int i; float closed=db_to_gain(-90.0f);
    for(i=0;i<n;++i){
        sGate=smooth_to(sGate,p.gate,1.0f-(float)exp(-1.0/(0.020*(double)sr)));
        float amtN=clampf(sGate/10,0,1), peak=absf(L[i]); if(absf(R[i])>peak)peak=absf(R[i]);
        float dc=peak>gateDetectorEnvelope?gateDetectorAttackCoeff:gateDetectorReleaseCoeff;
        gateDetectorEnvelope=dc*gateDetectorEnvelope+(1-dc)*peak;
        if(amtN<=0.0001f){gateIsOpen=1;gateHoldRemaining=gateHoldSamples;}else{
            float th=gate_threshold_db(sGate), open=db_to_gain(th), close=db_to_gain(th-6.0f);
            if(gateDetectorEnvelope>=open){gateIsOpen=1;gateHoldRemaining=gateHoldSamples;}
            else if(gateIsOpen){ if(gateDetectorEnvelope>=close)gateHoldRemaining=gateHoldSamples; else if(gateHoldRemaining>0)--gateHoldRemaining; else gateIsOpen=0; }
        }
        float target=gateIsOpen?1.0f:closed, gc=target>gateGain?gateOpenCoeff:gateCloseCoeff;
        gateGain=gc*gateGain+(1-gc)*target; if(!finitef(gateGain)){gateGain=1;gateIsOpen=1;gateDetectorEnvelope=0;}
        L[i]*=gateGain;R[i]*=gateGain;
    }
}

static void process_comp(float* L,float* R,int n){
    extern double sqrt(double);
    static const float th[11]={0,-5,-10,-15,-20,-25,-30,-36,-44,-55,-72};
    static const float ra[11]={1,1.6f,2.2f,3.0f,3.8f,4.631f,5.7f,7.2f,9.2f,12.0f,16.0f};
    float hpC=(float)exp(-2.0*PI*100.0/(double)sr), detC=(float)exp(-2.0*PI*95.0/(double)sr);
    float splitC=1-(float)exp(-2.0*PI*2400.0/(double)sr);
    int active=(int)(sr*.001f*clampf(p.devNaturalComp,0,2)+.5f); if(active<0)active=0;if(active>compMaxLookahead)active=compMaxLookahead;
    int detectorDelay=compMaxLookahead-active;
    int i,ch;
    for(i=0;i<n;++i){
        sComp=smooth_to(sComp,p.comp,baseSmoothCoeff); sCompTone=smooth_to(sCompTone,p.compTone,baseSmoothCoeff); sCompVol=smooth_to(sCompVol,p.compVol,baseSmoothCoeff);
        float an=clampf(sComp/10,0,1), threshold=lookup_comp_curve(an,th), ratio=lookup_comp_curve(an,ra);
        int outRead=compWrite-compMaxLookahead; while(outRead<0)outRead+=compDelaySize;
        int detRead=compWrite-detectorDelay; while(detRead<0)detRead+=compDelaySize;
        float* arr[2]={L,R};
        for(ch=0;ch<2;++ch){ CompState* s=&compState[ch]; float x=arr[ch][i]; float hp1=one_hp(x,&s->hp1In,&s->hp1Out,hpC); float hp2=one_hp(hp1,&s->hp2In,&s->hp2Out,hpC); compDelay[ch][compWrite]=p.compOn>0.5f?hp2:x; }
        float hybrid=0;
        for(ch=0;ch<2;++ch){ CompState* s=&compState[ch]; float ds=one_hp(compDelay[ch][detRead],&s->detectorHpIn,&s->detectorHpOut,detC); float pk=absf(ds); s->detectorRmsSquared=compRmsCoeff*s->detectorRmsSquared+(1-compRmsCoeff)*ds*ds; float rms=(float)sqrt(s->detectorRmsSquared>0?s->detectorRmsSquared:0); float h=(float)sqrt(.5f*pk*pk+.5f*rms*rms); if(h>hybrid)hybrid=h; }
        float detDb=gain_to_db(hybrid,-120), targetGr=comp_gr_db(detDb,threshold,ratio); float cc=targetGr<compGainReductionDb?compAttackCoeff:compReleaseCoeff; compGainReductionDb=cc*compGainReductionDb+(1-cc)*targetGr;
        float makeup=p.compOn>0.5f?fixed_makeup_db(an):0; float autoDb=compGainReductionDb+makeup; if(autoDb>8)autoDb=8;
        float tn=clampf(sCompTone/10,0,1), centered=(tn-.5f)*2, shaped=(centered<0?-1:1)*(float)pow(absf(centered),.85); if(absf(centered)<1e-9f)shaped=0;
        float lowDb=.5f-2.0f*shaped, highDb=-1.0f+8.0f*shaped; float lowG=db_to_gain(lowDb), highG=db_to_gain(highDb);
        float volDb=-18+36*(sCompVol/10), wetGain=db_to_gain(autoDb+volDb);
        for(ch=0;ch<2;++ch){ CompState* s=&compState[ch]; float delayed=compDelay[ch][outRead]; float wet=p.compOn>0.5f?delayed*wetGain:delayed; float lo=one_lp(wet,&s->toneLp,splitC), hi=wet-lo; arr[ch][i]=lo*lowG+hi*highG; }
        compWrite=(compWrite+1)%compDelaySize;
    }
}

static float drive_one_os(float x,DriveState* s,float osRate,float drive,float snap,float tone,float level,float boost,float ddOff,float dtOff,float ddOn,float dtOn,float clipDb,float highCutHz,PeakCoeff5 snapBell,PeakCoeff5 body125,PeakCoeff5 body250){
    const float attackMin=300,attackMax=3800,groundR=1000,fixedRf=10000,maxDriveR=500000,capF=47e-12f,calDb=-7.5f;
    float dN=clampf(drive/10,0,1), aN=clampf(snap/10,0,1);
    float atPos=(float)pow(aN,1.15), at5=attackMin*(float)pow(attackMax/attackMin,pow(.5,1.15));
    float attackFreq=aN<=.5f?attackMin*(float)pow(attackMax/attackMin,atPos):at5*(float)pow(1500.0f/at5,(aN-.5f)/.5f);
    float attackHp=(float)exp(-2.0*PI*attackFreq/osRate);
    float fastC=(float)exp(-1.0/(0.00060*osRate)), slowC=(float)exp(-1.0/(0.0160*osRate)), punchAC=(float)exp(-1.0/(0.00025*osRate)), punchRC=(float)exp(-1.0/(0.0320*osRate));
    float center=1200+(1900-1200)*aN, bandHp=(float)exp(-2.0*PI*(center/1.75f)/osRate), bandLp=1-(float)exp(-2.0*PI*(center*1.75f)/osRate);
    float punchDb=7*(float)pow(aN,1.15), punchMix=3.5f*(db_to_gain(punchDb)-1), satDrive=1+5.6f*aN;
    float lowPos=clampf(dN/.45f,0,1), nonlinAmount=lowPos*lowPos*(3-2*lowPos);
    float baseR=maxDriveR*((float)pow(10.0,2*dN)-1)/99.0f, extR=100000*(float)pow(dN,4), feedbackR=fixedRf+baseR+extR;
    float fixedHz=22000.0f*(highCutHz/8050.0f); if(fixedHz>osRate*.45f)fixedHz=osRate*.45f; float fixedC=1-(float)exp(-2.0*PI*fixedHz/osRate);
    float tN=clampf(tone/10,0,1), minRatio=.25f,maxRatio=13500.0f/8050.0f, ratioCut=tN<=.5f?minRatio*(float)pow(1.0/minRatio,tN/.5f):(float)pow(maxRatio,(tN-.5f)/.5f); float tHz=clampf(highCutHz*ratioCut,500,60000);if(tHz>osRate*.45f)tHz=osRate*.45f;float tC=1-(float)exp(-2.0*PI*tHz/osRate), dcC=(float)exp(-2.0*PI*24.0/osRate);
    float audibleLevel=level<.01f?.01f:level; float levelDb=audibleLevel<=5?(-24+(audibleLevel-.01f)*(25.0f/4.99f)):(1+(audibleLevel-5)); float snapDb=aN*10<=5?(aN*10)*(3.0f/5.0f):3+(aN*10-5)*(4.0f/5.0f); float lowDriveComp=15.5f*(1-nonlinAmount); float outG=level<.005f?0:db_to_gain(levelDb+calDb+snapDb+lowDriveComp);
    float b=clampf(boost,0,1), nonlinMult=1+15*b, nonlinDiv=1+.5f*b;
    float ai=absf(x); s->transientFastEnvelope=fastC*s->transientFastEnvelope+(1-fastC)*ai; s->transientSlowEnvelope=slowC*s->transientSlowEnvelope+(1-slowC)*ai;
    float diff=s->transientFastEnvelope-s->transientSlowEnvelope;if(diff<0)diff=0; float sens=7+10*aN,target=clampf(diff*sens,0,1), ec=target>s->transientPunchEnvelope?punchAC:punchRC; s->transientPunchEnvelope=ec*s->transientPunchEnvelope+(1-ec)*target;
    float thp=one_hp(x,&s->transientBandHpIn,&s->transientBandHpOut,bandHp), tb=one_lp(thp,&s->transientBandLp,bandLp), stb=(float)tanh(tb*satDrive)/satDrive, punch=stb*s->transientPunchEnvelope*punchMix;
    float bell=peak5_process(snapBell,x,&s->snapBell1,&s->snapBell2), shaped=x+aN*(bell-x); float pre=shaped+punch, branch=one_hp(pre,&s->attackHpIn,&s->attackHpOut,attackHp), current=(branch/groundR)*nonlinMult*nonlinAmount*db_to_gain(clipDb), capG=capF*osRate;
    float fv=0;if(nonlinAmount>1e-6f)fv=solve_feedback(current,feedbackR,capG,s->feedbackVoltage);s->feedbackVoltage=fv; float audible=fv/nonlinDiv;
    float direct=(1-b)*(ddOff*.01f)+b*(ddOn*.01f), effective=direct+b*(1-direct)*(1-nonlinAmount), tmix=(1-b)*(dtOff*.01f)+b*(dtOn*.01f); float wet=shaped*effective+punch*tmix+audible;
    wet=one_lp(wet,&s->fixedPost,fixedC); wet=one_lp(wet,&s->tone1,tC); wet=peak5_process(body125,wet,&s->body125_1,&s->body125_2); wet=peak5_process(body250,wet,&s->body250_1,&s->body250_2); wet=one_hp(wet,&s->dcIn,&s->dcOut,dcC); if(!finitef(wet)){wet=0;s->feedbackVoltage=0;} return wet*outG;
}

static void process_drive(float* L,float* R,int n){
    if(p.driveOn<=0.5f)return;
    int F=4; float osRate=sr*F; /* Web-only DRIVE CPU LOW */
    float osSmooth=1-(float)exp(-1.0/(0.025*(double)osRate)), boostSmooth=1-(float)exp(-1.0/(0.015*(double)osRate));
    PeakCoeff5 snapBell=make_peak5(6000,1.0f,4.0f,osRate), body125=make_peak5(125,1.1f,4.0f,osRate), body250=make_peak5(250,1.1f,4.0f,osRate);
    int i,ch,k; float* arr[2]={L,R};
    for(i=0;i<n;++i){
        sDevDriveLowCutHz=smooth_to(sDevDriveLowCutHz,p.devDriveLowCutHz,baseSmoothCoeff); float hpC=(float)exp(-2.0*PI*clampf(sDevDriveLowCutHz,10,300)/(double)sr);
        float filtered[2], previous[2], sum[2]={0,0};
        for(ch=0;ch<2;++ch){ DriveState* st=&driveState[ch]; float x=arr[ch][i]; float h1=one_hp(x,&st->inputHp1In,&st->inputHp1Out,hpC); filtered[ch]=one_hp(h1,&st->inputHp2In,&st->inputHp2Out,hpC); previous[ch]=st->interpPrev; }
        for(k=0;k<F;++k){
            float t=(float)(k+1)/(float)F;
            sDrive=smooth_to(sDrive,p.drive,osSmooth); sSnap=smooth_to(sSnap,p.snap,osSmooth); sTone=smooth_to(sTone,p.tone,osSmooth); sLevel=smooth_to(sLevel,p.level,osSmooth); sBoost=smooth_to(sBoost,p.boost,boostSmooth);
            sDevDirectOff=smooth_to(sDevDirectOff,p.devDirectOff,osSmooth); sDevTransientOff=smooth_to(sDevTransientOff,p.devTransientOff,osSmooth); sDevDirectOn=smooth_to(sDevDirectOn,p.devDirectOn,osSmooth); sDevTransientOn=smooth_to(sDevTransientOn,p.devTransientOn,osSmooth); sDevDriveClipDb=smooth_to(sDevDriveClipDb,p.devDriveClipDb,osSmooth); sDevDriveHighCutHz=smooth_to(sDevDriveHighCutHz,p.devDriveHighCutHz,osSmooth);
            for(ch=0;ch<2;++ch){ float xi=previous[ch]+(filtered[ch]-previous[ch])*t; sum[ch]+=drive_one_os(xi,&driveState[ch],osRate,sDrive,sSnap,sTone,sLevel,sBoost,sDevDirectOff,sDevTransientOff,sDevDirectOn,sDevTransientOn,sDevDriveClipDb,sDevDriveHighCutHz,snapBell,body125,body250); }
        }
        for(ch=0;ch<2;++ch){ driveState[ch].interpPrev=filtered[ch]; arr[ch][i]=sum[ch]/(float)F; }
    }
}

static void process_eq(float* L,float* R,int n){ if(p.eqOn<=0.5f)return; int i,b,ch; float* arr[2]={L,R}; for(ch=0;ch<2;++ch)for(i=0;i<n;++i){float x=arr[ch][i];for(b=0;b<NUM_EQ;++b)x=biquad_process(&eqState[ch][b],x);arr[ch][i]=x*db_to_gain(p.eqOut);} }

__attribute__((export_name("snap_process"))) void snap_process(int frames){
    if(frames<0)frames=0;if(frames>MAX_FRAMES)frames=MAX_FRAMES; int i;
    // Mono mode is default in v0.4.80. Collapse before processing and duplicate at output.
    for(i=0;i<frames;++i){float l=inL[i],r=inR[i];if(p.signalMode<0.5f){float m=.5f*(l+r);l=r=m;} sInputTrim=smooth_to(sInputTrim,p.inputTrim,baseSmoothCoeff);float cal=db_to_gain(5.0f+sInputTrim);outL[i]=l*cal;outR[i]=r*cal;}
    float peak=0;for(i=0;i<frames;++i){float a=absf(outL[i]);if(absf(outR[i])>a)a=absf(outR[i]);if(a>peak)peak=a;}inputPeakDb=gain_to_db(peak,-60);
    process_gate(outL,outR,frames);process_comp(outL,outR,frames);process_drive(outL,outR,frames);process_eq(outL,outR,frames);
    float outCal=db_to_gain(-5.0f);for(i=0;i<frames;++i){outL[i]*=outCal;outR[i]*=outCal;if(p.signalMode<0.5f)outR[i]=outL[i];}
}
