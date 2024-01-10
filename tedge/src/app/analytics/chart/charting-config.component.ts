import { Component, OnInit, EventEmitter, Output, Input } from '@angular/core';
import { EdgeService } from '../../edge.service';
import { MeasurmentType } from '../../property.model';
import { FormGroup } from '@angular/forms';
import { FormlyFormOptions, FormlyFieldConfig } from '@ngx-formly/core';

@Component({
  selector: 'charting-config',
  templateUrl: './charting-config.component.html',
  styleUrls: ['./charting-config.component.less']
})
export class ChartingConfigComponent implements OnInit {
  constructor(public edgeService: EdgeService) {
    console.log('Constructor: config:', this.config);
  }

  @Output() onChangeConfig = new EventEmitter<any>();
  @Output() onClose = new EventEmitter<any>();
  @Input() config: {
    fillCurve: boolean;
    fitAxis: boolean;
    rangeLow: any;
    rangeHigh: any;
    diagramName: string;
  };
  measurementTypes: MeasurmentType[] = [];
  isHidden: boolean = false;

  form = new FormGroup({});
  //options: FormlyFormOptions = {};
  fields: FormlyFieldConfig[] = [
    {
      key: 'diagramName',
      type: 'input',
      templateOptions: {
        label: 'Digram Name',
        required: true
      }
    },
    {
      key: 'fitAxis',
      type: 'checkbox',
      templateOptions: {
        label: 'Fit Axis',
        readonly: false,
        change: (field, $event) => {
          this.updateFitAxis();
        }
      }
    },
    {
      key: 'fillCurve',
      type: 'checkbox',
      templateOptions: {
        label: 'Fill Curve',
        readonly: false
      }
    },
    {
      key: 'rangeLow',
      type: 'input',
      hideExpression: 'model.fitAxis',
      templateOptions: {
        label: 'Lower range y-axis',
        type: 'number',
        readonly: false
      }
    },
    {
      key: 'rangeHigh',
      type: 'input',
      hideExpression: 'model.fitAxis',
      templateOptions: {
        label: 'Higher range y-axis',
        type: 'number',
        readonly: false
      }
    }
  ];
  async ngOnInit() {
    console.log('Init: config:', this.config);
    this.measurementTypes = await this.edgeService.getSeries();
  }

   onSaveClicked(): void {
    this.onChangeConfig.emit(this.config);
  }

   onCloseClicked(): void {
    this.onClose.emit();
  }

   updateFitAxis() {
    console.log('Adapting fit, before:', this.config);
    if (this.config.fitAxis) {
      delete this.config.rangeLow;
      delete this.config.rangeHigh;
    }
    console.log('Adapting fit, after:', this.config);
  }
}
