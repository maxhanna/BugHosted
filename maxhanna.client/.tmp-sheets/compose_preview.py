from PIL import Image
import math, os

ROOT='src/assets/d2survivors/maps/tiles/'
PROFILES={
 'a1-tamoe-highland-floor-tiles.png': dict(ground=[6,12,3,7,9], path=[0,8,11,14], edge=[10,4], accents=[1,2,4,5,13,15], style='trail'),
 'a1-catacombs-floor-tiles.png': dict(ground=[8,7,14,5], path=[10,12,14], edge=[13,9,15], accents=[11,4,2,3], style='cavern'),
 'a2-sewers-floor-tiles.png': dict(ground=[7,8,5,0,1], path=[10,5,8], edge=[9,6,2], accents=[11,3,15,4], style='cavern'),
 'a2-tal-rashas-tomb-floor-tiles.png': dict(ground=[0,2,4,6,10,14], path=[1,15,7], edge=[10,11,12], accents=[3,9,13,8,11], style='tomb'),
 'act2-floor-tiles.png': dict(ground=[2,9,10,12], path=[0,1,4], edge=[5,6,14], accents=[3,7,8,11,13,15], style='trail'),
 'act3-floor-tiles.png': dict(ground=[5,2,8], path=[1,6,10,14], edge=[0,4,9,11], accents=[3,7,12,13,15], style='cavern'),
 'a3-flayer-jungle-floor-tiles.png': dict(ground=[8,5,2,10,14], path=[1,6,12], edge=[0,9,11], accents=[3,4,7,13,15], style='trail'),
 'a3-durance-of-hate-floor-tiles.png': dict(ground=[0,4,6,8,12], path=[1,10,14], edge=[5,7,11], accents=[2,3,9,13,15], style='road'),
 'act4-floor-tiles.png': dict(ground=[8,0,4,5,9], path=[6,10,12], edge=[1,3], accents=[2,7,11,13,14,15], style='trail'),
 'a4-city-of-the-damned-floor-tiles.png': dict(ground=[13,1,2,4,10,15], path=[6,8,12], edge=[0,3,9], accents=[5,7,11,14], style='road'),
 'a4-chaos-sanctuary-floor-tiles.png': dict(ground=[9,1,3,4,6,8,12], path=[5,7,13], edge=[0,3], accents=[2,10,11,14,15], style='cavern'),
 'a5-bloody-foothills-floor-tiles.png': dict(ground=[2,4,6,11,12,14], path=[5,13,9], edge=[1,7,3], accents=[0,8,10,15], style='trail'),
 'a5-crystalline-passage-floor-tiles.png': dict(ground=[0,3,7,9,14,15], path=[11,13], edge=[2,4,6,10,12], accents=[1,5,8], style='cavern'),
 'a5-throne-of-destruction-floor-tiles.png': dict(ground=[13,5], path=[1,12,3], edge=[0,7,15], accents=[2,4,6,8,9,10,11,14], style='road'),
 'a6-forgotten-sands-floor-tiles.png': dict(ground=[2,4,8,11,12,15], path=[0,1,6], edge=[3,7,10,14], accents=[5,9,13], style='trail'),
 'a7-matrons-den-floor-tiles.png': dict(ground=[1,2,5,6,10,14], path=[4,8,12], edge=[0,9,11], accents=[3,7,13,15], style='cavern'),
 'a8-uber-tristram-floor-tiles.png': dict(ground=[0,2,5,7,9,13,15], path=[4,6,8,10,11,12], edge=[1,3], accents=[], style='road'),
}
IM={}
for name in PROFILES:
    sheet=Image.open(ROOT+name).convert('RGBA'); w,h=sheet.size; cw,ch=w//4,h//4
    cells=[]
    for i in range(16):
        c=sheet.crop(((i%4)*cw,(i//4)*ch,(i%4+1)*cw,(i//4+1)*ch)).copy()
        src=c.load(); px=c.load(); hw=cw/2; hh=ch/2
        inside=lambda xx,yy: abs(xx+0.5-hw)/hw + abs(yy+0.5-hh)/hh <= 0.94
        from collections import deque
        q=deque(); seen=set()
        for yy in range(ch):
            for xx in range(cw):
                if src[xx,yy][3]>0:
                    seen.add((xx,yy)); q.append((xx,yy))
        while q:
            xx,yy=q.popleft(); col=src[xx,yy]
            for nx,ny in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
                if not (0<=nx<cw and 0<=ny<ch) or (nx,ny) in seen or not inside(nx,ny): continue
                seen.add((nx,ny)); src[nx,ny]=col; q.append((nx,ny))
        for yy in range(ch):
            for xx in range(cw):
                if not inside(xx,yy): px[xx,yy]=(0,0,0,0)
        cells.append(c)
    IM[name]=cells

def imul(a,b):
    return ((a&0xffffffff)*(b&0xffffffff))&0xffffffff
def u32(v): return v&0xffffffff
def h(x,y,seed):
    v=u32(u32(imul(int(x),374761393))^u32(imul(int(y),668265263))^u32(imul(int(seed),1442695041)))
    v=imul(v^(v>>13),1274126177); v&=0xffffffff
    v^=v>>16
    return (v&0xffffffff)/4294967295
def smooth(t): return t*t*(3-2*t)
def noise(x,y,seed,scale):
    fx=x/scale; fy=y/scale; x0=math.floor(fx); y0=math.floor(fy); tx=smooth(fx-x0); ty=smooth(fy-y0)
    a=h(x0,y0,seed)*(1-tx)+h(x0+1,y0,seed)*tx
    b=h(x0,y0+1,seed)*(1-tx)+h(x0+1,y0+1,seed)*tx
    return a*(1-ty)+b*ty

def cell(name,x,y,seed,style):
    p=PROFILES[name]
    ph=(seed%997)/997*math.tau
    main=abs(y-(math.sin(x*0.11+ph)*2.6+math.sin(x*0.035+ph*1.9)*5.2+math.sin(x*0.008+ph)*8))
    if style=='road':
        wd=2.8; br=abs(x-(math.sin(y*0.09+ph*2.1)*4.5+math.sin(y*0.03+ph)*7+9)); bd=br
    elif style=='cavern':
        wd=1.9; bd=999
    elif style=='tomb':
        wd=2.0; bd=abs(x-(math.sin(y*0.06+ph*2.1)*3+9)) if noise(x,y,seed+51,9)>0.55 else 999
    else:
        wd=2.2; bd=abs(x-(math.sin(y*0.09+ph*2.1)*4.5+math.sin(y*0.03+ph)*7+9)) if noise(x,y,seed+51,9)>0.42 else 999
    pd=min(main,bd)
    detail=(noise(x,y,seed+97,2.5)-0.5)*2.2
    d=pd+detail
    broad=noise(x,y,seed+71,7)
    edge=False
    if style=='road':
        ispath = d<wd or broad>0.82
    elif style=='cavern':
        ispath = d<wd or (broad>0.76 and d<wd+3.5)
    elif style=='tomb':
        ispath = d<wd or (broad>0.79 and d<wd+3)
    else:
        ispath = d<wd or (broad>0.78 and d<wd+3)
    if ispath:
        pool=p['path']; n=noise(x,y,seed+131,2.2)
    elif d<wd+1.8:
        pool=p['edge']; n=noise(x,y,seed+149,1.8)
    else:
        pool=p['ground']; n=noise(x,y,seed+167,5.0)
    idx=pool[min(len(pool)-1,int(n*len(pool)))]
    # clustered props outside the walking surface
    if not ispath and d>wd+0.8 and p['accents'] and noise(x,y,seed+211,2.8)>0.80:
        a=noise(x,y,seed+223,4.0); idx=p['accents'][min(len(p['accents'])-1,int(a*len(p['accents'])))]
    cellim=IM[name][idx]
    if h(x,y,seed+307)>0.5: cellim=cellim.transpose(Image.FLIP_LEFT_RIGHT)
    return cellim

def render(name,style,seed,cols=26,rows=18,S=1,out='preview.png'):
    tw=178*S; th=89*S
    W=(cols+rows)*89+tw+80; H=(cols+rows)*44+th+80
    canvas=Image.new('RGBA',(W,H),(8,9,13,255))
    ox=rows*89+40; oy=40
    for y in range(rows):
        for x in range(cols):
            px=ox+(x-y)*89
            py=oy+(x+y)*44.5
            # diamond centers in game overlap grid offset by half tile; using simple iso
            c=cell(name,x,y,seed,style)
            c=c.resize((tw+6,th+6), Image.NEAREST)
            canvas.alpha_composite(c,(int(px-(tw+6)//2),int(py-(th+6)//2)))
    canvas.convert('RGB').save(out)

for name,style,seed,out in [
 ('a1-tamoe-highland-floor-tiles.png','trail',11,'.tmp-sheets/zone-act1.png'),
 ('a1-catacombs-floor-tiles.png','cavern',23,'.tmp-sheets/zone-catacombs.png'),
 ('act2-floor-tiles.png','trail',31,'.tmp-sheets/zone-act2.png'),
 ('a3-durance-of-hate-floor-tiles.png','road',47,'.tmp-sheets/zone-kurast.png'),
 ('a5-bloody-foothills-floor-tiles.png','trail',59,'.tmp-sheets/zone-act5.png'),
 ('act4-floor-tiles.png','trail',71,'.tmp-sheets/zone-act4.png')]:
    render(name,style,seed,out=out)
print('done')

render('a1-tamoe-highland-floor-tiles.png','trail',11,S=2,out='.tmp-sheets/zone-act1-2x.png')
render('a1-tamoe-highland-floor-tiles.png','trail',11,S=1,out='.tmp-sheets/zone-act1-1x-clean.png')
