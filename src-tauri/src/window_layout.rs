// Physical-pixel layout supports negative monitor coordinates and DPI scaling.
#[derive(Clone,Copy,Debug,PartialEq)]
pub struct Rect {pub x:i32,pub y:i32,pub width:i32,pub height:i32}
pub fn menu_height(requested:f64,available:f64)->Option<f64>{
    if !requested.is_finite()||!available.is_finite()||available<=0.{return None;}
    Some(requested.ceil().clamp(180_f64.min(available),960_f64.min(available)))
}
pub fn panel_size(width:f64,height:f64,work:Option<(Rect,f64)>,framed:bool)->(f64,f64){
    let Some((work,scale))=work else{return (width,height);};
    let reserve_height=if framed{48.}else{24.};
    (width.min((f64::from(work.width)/scale-24.).max(1.)),
     height.min((f64::from(work.height)/scale-reserve_height).max(1.)))
}

pub fn fit(mut window:Rect,work:Rect)->Rect{
    window.x=window.x.clamp(work.x,work.x+(work.width-window.width).max(0));
    window.y=window.y.clamp(work.y,work.y+(work.height-window.height).max(0));
    window
}
pub fn corner(work:Rect,width:i32,height:i32,margin:i32)->Rect{
    fit(Rect{x:work.x+work.width-width-margin,y:work.y+work.height-height-margin,width,height},work)
}
pub fn artwork_at(window:Rect,artwork:Rect)->Rect{
    Rect{x:window.x.saturating_add(artwork.x),y:window.y.saturating_add(artwork.y),..artwork}
}
fn snap_axis(value:i32,start:i32,length:i32,size:i32,distance:i32)->i32{
    let end=start+(length-size).max(0);
    let before=value-start;
    let after=end-value;
    if before<=after&&before<=distance{start}else if after<=distance{end}else{value}
}
pub fn fit_artwork(window:Rect,artwork:Rect,work:Rect,snap:Option<i32>)->Rect{
    let mut visible=fit(artwork_at(window,artwork),work);
    if let Some(distance)=snap{
        visible.x=snap_axis(visible.x,work.x,work.width,visible.width,distance);
        visible.y=snap_axis(visible.y,work.y,work.height,visible.height,distance);
    }
    Rect{x:visible.x-artwork.x,y:visible.y-artwork.y,..window}
}
pub fn resize_artwork(window:Rect,previous:Rect,next:Rect,work:Rect,tolerance:i32)->Rect{
    let old=artwork_at(window,previous);
    let right=work.x+work.width;
    let bottom=work.y+work.height;
    let x=if (old.x-work.x).abs()<=tolerance{work.x-next.x}
          else if (old.x+old.width-right).abs()<=tolerance{right-next.x-next.width}
          else{window.x};
    let y=if (old.y-work.y).abs()<=tolerance{work.y-next.y}
          else if (old.y+old.height-bottom).abs()<=tolerance{bottom-next.y-next.height}
          else{window.y};
    fit_artwork(Rect{x,y,..window},next,work,None)
}
fn overlap(a:Rect,b:Rect)->i64{
    let width=((a.x+a.width).min(b.x+b.width)-a.x.max(b.x)).max(0);
    let height=((a.y+a.height).min(b.y+b.height)-a.y.max(b.y)).max(0);
    width as i64*height as i64
}
pub fn beside(pet:Rect,width:i32,height:i32,work:Rect,gap:i32)->Rect{
    [(pet.x-width-gap,pet.y+pet.height-height),(pet.x+pet.width+gap,pet.y+pet.height-height),
     (pet.x+pet.width-width,pet.y-height-gap),(pet.x+pet.width-width,pet.y+pet.height+gap)]
        .map(|(x,y)|fit(Rect{x,y,width,height},work)).into_iter().min_by_key(|candidate|overlap(*candidate,pet)).unwrap()
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn menu_content_fits_work_area_and_rejects_invalid_measurements(){
        assert_eq!(menu_height(453.2,1000.),Some(454.));assert_eq!(menu_height(620.,510.),Some(510.));
        assert_eq!(menu_height(360.,140.),Some(140.));assert_eq!(menu_height(f64::NAN,900.),None);
        assert_eq!(menu_height(450.,0.),None);
    }
    #[test]fn settings_leave_pet_visible_on_scaled_and_negative_monitors(){
        for work in [Rect{x:0,y:0,width:1920,height:1040},Rect{x:-2560,y:-160,width:2560,height:1400}]{
            for scale in [1,2]{
                let pet=corner(work,420*scale,430*scale,24*scale);
                let settings=beside(pet,440*scale,651*scale,work,16*scale);
                assert_eq!(fit(pet,work),pet);
                assert_eq!(fit(settings,work),settings);
                if scale==1{assert_eq!(overlap(pet,settings),0);}
                assert!(overlap(pet,settings)<pet.width as i64*pet.height as i64,"settings must not completely cover the pet");
            }
        }
    }
    #[test]fn small_work_area_does_not_panic_when_window_is_larger(){
        let work=Rect{x:100,y:100,width:300,height:300};
        assert_eq!(corner(work,420,430,24).x,100);
        assert_eq!(corner(work,420,430,24).y,100);
        let work=Some((Rect{x:-620,y:0,width:620,height:460},2.));
        assert_eq!(panel_size(620.,760.,work,true),(286.,182.));
        assert_eq!(panel_size(356.,470.,work,false),(286.,206.));
    }
    #[test]fn transparent_padding_can_extend_past_work_area_when_art_is_snapped(){
        let work=Rect{x:-1920,y:-100,width:1920,height:1100};
        let window=Rect{x:-427,y:609,width:450,height:450};
        let art=Rect{x:20,y:36,width:395,height:374};
        let placed=fit_artwork(window,art,work,Some(36));
        assert_eq!((placed.x,placed.y),(-415,590));
        let visible=artwork_at(placed,art);
        assert_eq!(visible.x+visible.width,0);
        assert_eq!(visible.y+visible.height,1000);
        assert_eq!(fit_artwork(placed,art,work,None),placed);
        assert!(placed.y+placed.height>1000);
    }
    #[test]fn resize_keeps_an_attached_edge_and_does_not_snap_a_free_window(){
        let work=Rect{x:0,y:0,width:1600,height:960};
        let original=Rect{x:1220,y:580,width:420,height:420};
        let before=Rect{x:12,y:25,width:368,height:355};
        let after=Rect{x:6,y:13,width:184,height:177};
        let resized=resize_artwork(original,before,after,work,6);
        assert_eq!((resized.x,resized.y),(1410,770));
        let free=Rect{x:1200,y:550,..original};
        assert_eq!(resize_artwork(free,before,after,work,6),free);
    }
}
