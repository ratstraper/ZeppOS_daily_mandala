export default class LoadingAnimationComponent {
  constructor(hmUI) {
    this._hmUI = hmUI;
    this._img = null;
    // this._deleted = false;
  }

  show(x, y) {
    this._img = this._hmUI.createWidget(this._hmUI.widget.IMG_ANIM, {
      x: x,
      y: y,
      anim_path: "loading-animation",
      anim_prefix: "loading",
      anim_ext: "png",
      anim_size: 10,
      anim_fps: 7,
      repeat_count: 0,
      anim_repeat: true,
      anim_status: this._hmUI.anim_status.START,
    });
  }

  stop() {
    if (this._img) {
      this._img.setProperty(this._hmUI.prop.ANIM_STATUS, this._hmUI.anim_status.STOP);
    }
  }

  delete() {
    // this._deleted = true;
    if (this._img) {
      this._hmUI.deleteWidget(this._img);
      this._img = null;
    }
  }
}