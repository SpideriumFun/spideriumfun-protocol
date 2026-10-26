import numpy as np, json
from PIL import Image
from sklearn.cluster import KMeans
srcs=['brand/LOGO SPIDERIUM PNG...png','reference/SAMPUL SPIDERIUM JPG.jpg.jpeg','reference/SPIDERIUM 1.jpg.jpeg']
px=[];meta=[]
for f in srcs:
    a=np.array(Image.open(f).convert('RGBA'));H,W=a.shape[:2]
    rgb=a[...,:3].astype(int);al=a[...,3]
    mx=rgb.max(-1);mn=rgb.min(-1);sat=(mx-mn)
    m=(al>200)&(sat>60)&(mx>110)   # saturated, lit pixels = the violet family
    ys,xs=np.nonzero(m)
    for y,x in zip(ys[::max(1,len(ys)//40000)],xs[::max(1,len(ys)//40000)]):
        px.append(rgb[y,x]);meta.append((f,int(x),int(y)))
px=np.array(px);print(len(px))
km=KMeans(4,n_init=6,random_state=2).fit(px)
cnt=np.bincount(km.labels_)
for k in np.argsort(-cnt):
    d=((px-km.cluster_centers_[k])**2).sum(1);j=int(d.argmin())
    print(round(cnt[k]/len(px),3),km.cluster_centers_[k].round(0),'#%02x%02x%02x'%tuple(px[j]),meta[j])
