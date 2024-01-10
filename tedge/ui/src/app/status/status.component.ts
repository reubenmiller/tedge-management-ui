import { Component, ElementRef, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { ActionControl, Column, ColumnDataType, DisplayOptions, Pagination, Row } from '@c8y/ngx-components';
import { Observable } from 'rxjs';
import { properCase, unCamelCase } from '../cloud/cloud-helper';
import { EdgeService } from '../edge.service';
import { RowStructure } from '../property.model';
//import { Terminal } from "xterm";

@Component({
  selector: 'app-configuration',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.css', './xterm.css'],
  encapsulation: ViewEncapsulation.None,
})
export class StatusComponent implements OnInit {
  columns: Column[];
  container: HTMLElement;
  serviceStatus: string;
  configuration: string;
  rows$: Observable<Row[]>;
  pagination: Pagination = {
    pageSize: 30,
    currentPage: 1,
  };

  actionControls: ActionControl[];

  displayOptions: DisplayOptions = {
    bordered: true,
    striped: true,
    filter: false,
    gridHeader: true
  };


  constructor(private edgeService: EdgeService) {
    this.columns = this.getDefaultColumns();
  }
  ngOnInit() {
    this.edgeService.getEdgeConfiguration().then(data => {
      console.log ("Result configuration", data )
      let  rows: Row[] = [];
      Object.keys(data)
        .forEach(key => {
          //console.log ("Row configuration", key, unCamelCase(key), unCamelCase(key), data[key] )
          rows.push(
            {
              id: key,
              name: key,
              value: data[key]
            })
        });
      //console.log ("Result configuration", rows )
      this.rows$ = new Observable<Row[]>(observer => {
        observer.next(rows);
        observer.complete();
      })
      this.edgeService.getEdgeServiceStatus().then( data => {
        //console.log ("Result status", data )
        this.serviceStatus =  data.result
      })
    })
  }

  getDefaultColumns(): Column[] {
    return [
      {
        name: 'name',
        header: 'Name',
        path: 'name',
        filterable: true,
        cellCSSClassName: 'small-font'
      },
      {
        header: 'Value',
        name: 'value',
        sortable: true,
        filterable: true,
        path: 'value',
        dataType: ColumnDataType.TextShort,
        cellCSSClassName: 'small-font',
      },
    ];
  }

}
