import sys, struct, glob, json
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans
CT={0:'gray',2:'rgb',3:'indexed',4:'gray+alpha',6:'rgba'}
out={}
for f in sorted(glob.glob('brand/*')+glob.glob('reference/*')):
    b=open(f,'rb').read()
    info={'bytes':len(b)}
    if b[:8]==b'\x89PNG\r\n\x1a\n':
        w,h,bd,ct=struct.unpack('>IIBB',b[16:26])
        info.update(kind='png',w=w,h=h,bitdepth=bd,colourtype=ct,colourtype_name=CT[ct])
        chunks=[];i=8
        while i<len(b):
            n=struct.unpack('>I',b[i:i+4])[0];chunks.append(b[i+4:i+8].decode());i+=12+n
        info['chunks']=sorted(set(chunks))
    else:
        info['kind']='jpeg'
    im=Image.open(f);info['mode']=im.mode;info['size']=im.size
    a=np.array(im.convert('RGBA'))
    al=a[...,3]
    if im.mode=='RGBA':
        hist=np.bincount(al.ravel(),minlength=256)
        info['alpha_min']=int(al.min());info['alpha_max']=int(al.max())
        info['alpha_0_px']=int(hist[0]);info['alpha_255_px']=int(hist[255]);info['alpha_partial_px']=int(al.size-hist[0]-hist[255])
        bins=[int(hist[i:i+32].sum()) for i in range(0,256,32)]
        info['alpha_hist_8bins']=bins
        z=(al==0)
        info['transparent_rgb_pureblack_px']=int((z&(a[...,:3].sum(-1)==0)).sum())
        info['transparent_rgb_nonblack_px']=int((z&(a[...,:3].sum(-1)>0)).sum())
    rgb=a[...,:3].reshape(-1,3)
    rng=np.random.default_rng(1)
    s=rgb[rng.choice(len(rgb),60000,replace=False)]
    km=KMeans(8,n_init=4,random_state=1).fit(s)
    lab=km.predict(rgb[::7])
    cnt=np.bincount(lab,minlength=8)
    pal=[]
    H,W=a.shape[:2]
    flat=a[...,:3].reshape(-1,3).astype(int)
    for k in np.argsort(-cnt):
        c=km.cluster_centers_[k]
        d=((flat-c)**2).sum(1);j=int(d.argmin())
        px=flat[j]
        pal.append({'share':round(cnt[k]/cnt.sum(),4),'center':[round(float(x),1) for x in c],'snapped':'#%02x%02x%02x'%tuple(px),'at':[j%W,j//W]})
    info['kmeans']=pal
    out[f]=info
json.dump(out,open('tools/asset-report.json','w'),indent=1)
for f,i in out.items():
    print(f,{k:v for k,v in i.items() if k!='kmeans'})
    print('  ',[(p['snapped'],p['share']) for p in i['kmeans']])
