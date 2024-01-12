import {
  Directive,
  ElementRef,
  AfterContentInit,
  Renderer2,
  AfterViewInit,
  OnInit
} from '@angular/core';

@Directive({ selector: '[tedgeStatusColoring]' })
export class StatusColoringDirective
  implements AfterContentInit, AfterViewInit, OnInit
{
  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  /*     ngAfterViewChecked() {
        console.log ("Formatted status ngAfterViewChecked:")
        this.highlight();
    } */

  ngAfterViewInit(): void {
    console.log(
      'Formatted status ngAfterViewInit innerText:',
      this.el.nativeElement.innerText
    );
    console.log('Formatted status ngAfterViewInit:', this.el.nativeElement);
    console.log(
      'Formatted status ngAfterViewInit innerHTML:',
      this.el.nativeElement.innerHTML
    );
  }

  ngAfterContentInit(): void {
    console.log(
      'Formatted status ngAfterContentInit innerText:',
      this.el.nativeElement.innerText
    );
    console.log('Formatted status ngAfterContentInit:', this.el.nativeElement);
    console.log(
      'Formatted status ngAfterContentInit innerHTML:',
      this.el.nativeElement.innerHTML
    );
  }

  ngOnInit() {
    // const dummy = this.el.nativeElement.innerText;
    console.log('Formatted status ngOnInit:', this.el.nativeElement);
    console.log(
      'Formatted status ngOnInit innerText:',
      this.el.nativeElement.innerText
    );
    this.highlight();
  }

  highlight() {
    // find all html elements on the page inside the body tag
    // let el = this.el.nativeElement;
    // console.log ("Formatted status entry native:", this.el.nativeElement)
    // console.log ("Formatted status entry native.innerText:", this.el.nativeElement.innerText)
    // console.log ("Formatted status entry native.innerHTML:", this.el.nativeElement.innerHTML)
    // console.log ("Formatted status entry native:", this.el.nativeElement.innerText)
    // console.log ("Formatted status entry outer:", this.el.nativeElement.outerHTML)
    // console.log ("Formatted status entry this.el.nativeElement.innerHTML:", this.el.nativeElement.innerHTML)
    // console.log ("Formatted status entry this.el.nativeElement.outerHTML:", this.el.nativeElement.outerHTML)
    // console.log ("Formatted status entry el:", el)
    // get our replacement ready
    const stopped = "<span class='red'>stopped</span>";
    const crashed = "<span class='red'>crashed</span>";
    const started = "<span class='red'>started</span>";
    const org: string = this.el.nativeElement as string;
    console.log('Formatted highlight:', org);
    // let fmt: string = org.replace("stopped", stopped).replace("crashed", crashed).replace("started", started);
    // this.el.nativeElement.innerHTML = org;
    // this.el.nativeElement.innerText = fmt
    console.log('Formatted status exit:', org);
  }
}
